import { afterEach, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { createJobQueue } from "@iam/jobs";
import { createOrganizationSearchInvalidation } from "@iam/organization-search-read-model/producer";
import {
  createOrganizationSearchVerifier,
  createOrganizationSearchWorkerModule,
} from "@iam/organization-search-read-model/worker";
import { createWorkerPostgresTestHarness } from "../postgres/postgres-test-harness";
import { resolveWorkerRedisTestUrl } from "../redis/redis-test-harness";
import { createOrganizationQueueInventory } from "./organization-queue-inventory";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let module: ReturnType<typeof createOrganizationSearchWorkerModule>;
let queue: ReturnType<typeof createJobQueue>;
let inventory: Awaited<ReturnType<typeof createOrganizationQueueInventory>>;
let commands: ReturnType<typeof runProcessCommandSmoke>[];
let redis: { host: string; port: number; db: number; password?: string; username?: string };
function createModule() {
  return createOrganizationSearchWorkerModule({
    db: harness.db,
    redis,
    config: { concurrency: 2 },
    logger: { info() {}, error() {} },
  });
}
beforeEach(async () => {
  commands = [];
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
  redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  harness = await createWorkerPostgresTestHarness();
  queue = createJobQueue({ name: "organization-search", redis });
  inventory = await createOrganizationQueueInventory(queue, harness.sql);
  module = createModule();
  await harness.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type)
    VALUES (1,'ROOT','Root',-1,'/1',1,'部门'),(2,'CHILD','Child',1,'/1/2',2,'部门')`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0)`;
  await module.processor.backfillAllOrganizations();
  await module.startConsumers();
  await converged();
  await module.close();
  module = createModule();
  const uow = createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(db, lifecycle) {
      return {
        db,
        invalidation: createOrganizationSearchInvalidation({
          db,
          lifecycle,
          jobProducer: {
            async enqueueSourceChanges() {
              return { enqueued: 0 };
            },
          },
        }),
      };
    },
  });
  await uow.transaction(async ({ db, invalidation }) => {
    await db.execute("UPDATE organization SET org_name='Recovered root' WHERE id=1");
    await invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["name"] }]);
  });
});
afterEach(async () => {
  const failures: unknown[] = [];
  // A failed assertion/observer must not race fixture teardown with a live CLI.
  // Each process harness remains bounded and all started commands are awaited.
  for (const result of await Promise.allSettled(commands)) {
    if (result.status === "rejected") failures.push(result.reason);
  }
  try {
    await module?.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    if (inventory) {
      await inventory.seal();
      await inventory.removeOwnedJobs();
    }
  } catch (error) {
    failures.push(error);
  }
  const closed = await Promise.allSettled([queue?.close(), harness?.close()]);
  for (const result of closed) if (result.status === "rejected") failures.push(result.reason);
  if (failures.length) throw new AggregateError(failures, "Organization PG lifecycle fixture cleanup failed");
}, 40_000);

for (const mode of ["backfill", "repair"] as const)
  for (const control of ["deadline", "SIGTERM"] as const) {
    test(`${mode} ${control} releases its actual blocked PostgreSQL backend and preserves prior durable facts`, async () => {
      const before = await stocks();
      const jobsBefore = (await queue.getJobs()).map((job) => job.id).sort();
      const blocker = await harness.sql.reserve();
      try {
        await blocker.unsafe("BEGIN");
        await blocker.unsafe(
          mode === "backfill"
            ? "LOCK TABLE organization IN ACCESS EXCLUSIVE MODE"
            : "LOCK TABLE organization_search_change IN ACCESS EXCLUSIVE MODE",
        );
        const pending = command(
          mode,
          control === "deadline" ? 1 : 143,
          control === "deadline" ? ["--deadline-ms", "500"] : [],
          control === "SIGTERM" ? ["--preload=./test-integration/process/interrupt-command.fixture.ts"] : [],
        );
        const blocked = await Promise.race([
          waitForLocks(1),
          pending.then(() => {
            throw new Error("Command completed without an observed PostgreSQL lock wait");
          }),
        ]);
        const result = await pending;
        expect(result.output).toContain(`"signal":"${control}"`);
        const applicationName = await closedOwner(result.output);
        expect(blocked[0]?.application_name).toBe(applicationName);
      } finally {
        await blocker.unsafe("ROLLBACK");
        blocker.release();
      }
      const after = await stocks();
      const jobsAfter = (await queue.getJobs()).map((job) => job.id).sort();
      expect(after).toEqual(before);
      expect(jobsAfter).toEqual(jobsBefore);
      await module.startConsumers();
      await command("repair", 0);
      await converged();
      const recovered =
        await harness.sql`SELECT document->'organization'->>'name' AS name,source_version FROM organization_search_document WHERE organization_id=1`;
      expect([...recovered]).toEqual([{ name: "Recovered root", source_version: "2" }]);
      const repeated = await command("repair", 0);
      expect(repeated.output).toContain('"enqueued":0');
    }, 20_000);
  }

for (const canceledMode of ["backfill", "repair"] as const) {
  test(`canceling ${canceledMode} preserves the other maintenance command's blocked backend and durable work`, async () => {
    const otherMode = canceledMode === "backfill" ? "repair" : "backfill";
    const before = await stocks();
    const blocker = await harness.sql.reserve();
    let other: ReturnType<typeof command> | undefined;
    try {
      await blocker.unsafe("BEGIN");
      // Both commands wait on the same table in the same database/user, but
      // their invocation identities must still fence cancellation precisely.
      await blocker.unsafe("LOCK TABLE organization_search_change IN ACCESS EXCLUSIVE MODE");
      other = command(otherMode, 0, ["--deadline-ms", "5000"]);
      const canceled = command(canceledMode, 1, ["--deadline-ms", "500"]);
      const blocked = await Promise.race([
        waitForLocks(2),
        canceled.then(() => {
          throw new Error("Command cancellation preceded two real PostgreSQL lock waits");
        }),
      ]);
      const result = await canceled;
      const canceledName = await closedOwner(result.output);
      const peer = blocked.find((row) => row.application_name !== canceledName);
      if (!peer) throw new Error("Missing independently owned peer backend");
      const retained =
        await harness.sql`SELECT pid,wait_event_type FROM pg_stat_activity WHERE pid=${peer.pid} AND application_name=${peer.application_name}`;
      expect([...retained]).toEqual([{ pid: peer.pid, wait_event_type: "Lock" }]);
    } finally {
      await blocker.unsafe("ROLLBACK");
      blocker.release();
    }
    if (!other) throw new Error("Peer command did not start");
    const completed = await other;
    expect(completed.output).toContain('"publication":"not-verified"');
    await closedOwner(completed.output);
    const after = await stocks();
    expect(after?.source).toEqual(before?.source);
    expect(after?.documents).toEqual(before?.documents);
    await module.startConsumers();
    await command("repair", 0);
    await converged();
  }, 20_000);
}

for (const mode of ["backfill", "repair"] as const) {
  test(`${mode} query failure closes its PostgreSQL data/control connections and preserves recoverable work`, async () => {
    const before = await stocks();
    const renamed = mode === "backfill" ? "organization" : "organization_search_change";
    await harness.sql.unsafe(`ALTER TABLE ${renamed} RENAME TO command_unavailable`);
    let result: Awaited<ReturnType<typeof command>>;
    try {
      result = await command(mode, 1);
    } finally {
      await harness.sql.unsafe(`ALTER TABLE command_unavailable RENAME TO ${renamed}`);
    }
    expect(result.output).toContain('"signal":"command-failed"');
    await closedOwner(result.output);
    const after = await stocks();
    expect(after).toEqual(before);
    await module.startConsumers();
    await command("repair", 0);
    await converged();
  }, 20_000);
}

async function closedOwner(output: string) {
  const applicationName = output.match(/"applicationName":"([^"]+)"/u)?.[1];
  expect(applicationName).toBeDefined();
  if (!applicationName) throw new Error("Command did not identify its PG owner");
  expect(Buffer.byteLength(`${applicationName}-cancel`)).toBeLessThanOrEqual(63);
  const sessions =
    await harness.sql`SELECT pid FROM pg_stat_activity WHERE application_name=${applicationName} OR application_name=${`${applicationName}-cancel`}`;
  expect([...sessions]).toEqual([]);
  return applicationName;
}

async function waitForLocks(count: number) {
  const sql = harness.sql;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await sql<
      { pid: number; application_name: string }[]
    >`SELECT pid,application_name FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock'`;
    const owned = rows.filter((row) => row.application_name.startsWith("iam-org-"));
    if (owned.length === count) return owned;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Did not observe the expected actual command PostgreSQL lock waits");
}

async function stocks() {
  const [row] = await harness.sql`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization t) AS source,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY organization_id) FROM organization_search_document t) AS documents,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY organization_id) FROM organization_search_dirty t) AS dirty,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization_search_change t) AS changes`;
  return row;
}
async function converged() {
  const verifier = createOrganizationSearchVerifier({ db: harness.db });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await verifier.verify()).status === "passed") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Organization publication did not converge");
}
async function command(
  mode: "backfill" | "repair",
  expectedExitCode: number,
  args: string[] = [],
  bunArgs: string[] = [],
) {
  const pending = runProcessCommandSmoke({
    label: `Organization ${mode} PG lifecycle`,
    expectedExitCode,
    completionTimeoutMs: 5000,
    cleanupTimeoutMs: 5000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          ...bunArgs,
          "run",
          `src/commands/organization-search/organization-search-${mode}.ts`,
          ...args,
        ],
        cwd: workerRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
          IAM_WORKER_REDIS_HOST: redis.host,
          IAM_WORKER_REDIS_PORT: String(redis.port),
          IAM_WORKER_REDIS_DB: String(redis.db),
          IAM_WORKER_REDIS_USERNAME: redis.username,
          IAM_WORKER_REDIS_PASSWORD: redis.password,
          IAM_WORKER_LOG_FORMAT: "json",
          IAM_WORKER_LOG_LEVEL: "info",
        },
      }),
  });
  commands.push(pending);
  void pending.catch(() => {}); // The caller and fixture teardown propagate rejection.
  return await pending;
}
