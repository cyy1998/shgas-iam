import { afterEach, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  terminateProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import { createOrganizationSearchInvalidation } from "@iam/organization-search-read-model/producer";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model/query";
import {
  createOrganizationSearchWorkerModule,
  OrganizationRebuildJobPayloadSchema,
  OrganizationSourceChangeJobPayloadSchema,
} from "@iam/organization-search-read-model/worker";
import { createWorkerPostgresTestHarness, reserveWorkerPostgresConnection } from "../postgres/postgres-test-harness";
import { createHangingRedisServer } from "../process/hanging-redis-server";
import { resetWorkerRedisTestDatabase, resolveWorkerRedisTestUrl } from "../redis/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let module: ReturnType<typeof createOrganizationSearchWorkerModule>;
let prefix: string;
let stopExecutors: Array<() => Promise<void> | void>;
let redis: { host: string; port: number; db: number; password?: string; username?: string };
let search: ReturnType<typeof createOrganizationSearchQueryService>;
beforeEach(async () => {
  stopExecutors = [];
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
  redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined,
  };
  harness = await createWorkerPostgresTestHarness();
  stopExecutors.push(harness.close);
  prefix = DEFAULT_QUEUE_PREFIX;
  module = createOrganizationSearchWorkerModule({
    db: harness.db,
    redis,
    config: { concurrency: 2 },
    logger: { info() {}, error() {} },
  });
  stopExecutors.push(module.close);
  search = createOrganizationSearchQueryService({ repository: createOrganizationSearchQueryRepository(harness.db) });
  await harness.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type)
    VALUES (1,'ROOT','Root',-1,'/1',1,'部门'), (2,'CHILD','Child',1,'/1/2',2,'部门')`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0)`;
});
afterEach(async () => {
  if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
});

async function until<T>(read: () => Promise<T | undefined>, timeout = 15_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Organization recovery did not reach the required durable state");
}
async function published(version: string, rootName: string) {
  return await until(async () => {
    const [row] = await harness.sql`SELECT source_version FROM organization_search_document WHERE organization_id=2`;
    if (row?.source_version !== version) return undefined;
    const documents = await search.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
    if (documents[0]?.organization.path[0]?.name !== rootName) return undefined;
    return documents;
  });
}
async function initialPublication() {
  await module.processor.backfillAllOrganizations();
  await module.startConsumers();
  await published("1", "Root");
}
async function renameRoot() {
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
}
function environment(overrides: NodeJS.ProcessEnv = {}) {
  return {
    ...process.env,
    NODE_ENV: "test",
    IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
    IAM_WORKER_REDIS_HOST: redis.host,
    IAM_WORKER_REDIS_PORT: String(redis.port),
    IAM_WORKER_REDIS_DB: String(redis.db),
    IAM_WORKER_REDIS_USERNAME: redis.username,
    IAM_WORKER_REDIS_PASSWORD: redis.password,
    IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX: prefix,
    IAM_WORKER_LOG_FORMAT: "json",
    IAM_WORKER_LOG_LEVEL: "info",
    IAM_WORKER_USER_PROFILE_CONCURRENCY: "unused-invalid",
    IAM_WORKER_BULL_BOARD_PATH: "unused-invalid",
    ...overrides,
  };
}
async function command(
  mode: "repair" | "backfill",
  args: string[] = [],
  expectedExitCode = 0,
  overrides: NodeJS.ProcessEnv = {},
  runtimeArgs: string[] = [],
) {
  const pending = runProcessCommandSmoke({
    label: `Organization search ${mode}`,
    completionTimeoutMs: 15_000,
    cleanupTimeoutMs: 5_000,
    expectedExitCode,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          "run",
          ...runtimeArgs,
          `src/commands/organization-search/organization-search-${mode}.ts`,
          ...args,
        ],
        cwd: workerRoot,
        env: environment(overrides),
      }),
  });
  stopExecutors.push(async () => {
    await pending;
  });
  void pending.catch(() => {});
  return await pending;
}

test("ordinary BullMQ expansion retries exhaust without losing committed subtree work, and repeated CLI repair recovers it", async () => {
  await initialPublication();
  await renameRoot();
  await harness.sql.unsafe(`CREATE FUNCTION reject_expansion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'controlled expansion failure'; END $$`);
  await harness.sql.unsafe(
    "CREATE TRIGGER reject_expansion BEFORE INSERT OR UPDATE ON organization_search_dirty FOR EACH ROW EXECUTE FUNCTION reject_expansion()",
  );
  // Wake the source stage only: the failure is in the ordinary consumer, never in repair.
  await module.processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change`;
  const ownChangeIds = new Set(changes.map((change) => change.id));
  const failed = await until(async () => {
    const jobs = await module.queue.getJobs(["failed"]);
    return jobs.find(
      (job) =>
        job.name === "expand-change" &&
        job.attemptsMade === 3 &&
        ownChangeIds.has(OrganizationSourceChangeJobPayloadSchema.parse(job.data).changeId),
    );
  });
  const payload = OrganizationSourceChangeJobPayloadSchema.parse(failed.data);
  const [state] =
    await harness.sql`SELECT status,attempts,last_error FROM organization_search_change WHERE id=${payload.changeId}`;
  const old = await search.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
  expect(state).toMatchObject({ status: "failed", attempts: 3 });
  expect(state?.last_error).toEqual(expect.any(String));
  expect(old[0]?.organization.path[0]?.name).toBe("Root");
  await harness.sql.unsafe("DROP TRIGGER reject_expansion ON organization_search_dirty");
  await harness.sql.unsafe("DROP FUNCTION reject_expansion()");
  const repaired = await command("repair");
  const result = await published("2", "Recovered root");
  await command("repair");
  const facts = await harness.sql`SELECT org_name FROM organization WHERE id=1`;
  const versions = await harness.sql`SELECT version,status FROM organization_search_dirty ORDER BY organization_id`;
  expect(repaired.output).toContain('"publication":"not-verified"');
  expect(result[0]?.organization.path[0]?.name).toBe("Recovered root");
  expect(facts[0]?.org_name).toBe("Recovered root");
  expect([...versions]).toEqual([
    { version: "2", status: "processed" },
    { version: "2", status: "processed" },
  ]);
}, 45_000);

test("ordinary BullMQ rebuild retries exhaust while the legal old document stays searchable, then CLI repair publishes the same pending version", async () => {
  await initialPublication();
  await harness.sql`DELETE FROM organization_closure WHERE ancestor_id=1 AND descendant_id=2`;
  await renameRoot();
  const uow = createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(db, lifecycle) {
      return {
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
  await uow.transaction(async ({ invalidation }) => {
    await invalidation.recordChanges([{ kind: "updated", organizationId: 2, changedFields: ["status"] }]);
  });
  await module.processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  const failed = await until(async () => {
    const jobs = await module.queue.getJobs(["failed"]);
    return jobs.find(
      (job) =>
        job.name === "rebuild-document" &&
        OrganizationRebuildJobPayloadSchema.safeParse(job.data).data?.organizationId === 2 &&
        OrganizationRebuildJobPayloadSchema.safeParse(job.data).data?.version === "2" &&
        job.attemptsMade === 3,
    );
  });
  const [state] =
    await harness.sql`SELECT version,status,attempts,last_error FROM organization_search_dirty WHERE organization_id=2`;
  const old = await search.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
  expect(failed.attemptsMade).toBe(3);
  expect(state).toMatchObject({ version: "2", status: "failed", attempts: 3 });
  expect(state?.last_error).toEqual(expect.any(String));
  expect(old[0]?.organization.path[0]?.name).toBe("Root");
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,2,1)`;
  await command("repair");
  const result = await published("2", "Recovered root");
  expect(result[0]?.organization.path[0]?.name).toBe("Recovered root");
}, 45_000);

test("repair closes a connected Redis peer that never answers readiness and leaves pending work for another invocation", async () => {
  await module.processor.backfillAllOrganizations();
  const server = await createHangingRedisServer();
  stopExecutors.push(server.close);
  const result = await command("repair", [], 1, { IAM_WORKER_REDIS_PORT: String(server.port) });
  const states = await harness.sql`SELECT status FROM organization_search_change`;
  expect(result.output).toContain('"status":"failed"');
  expect(result.output).toContain("Organization search command shutting down");
  expect(states.map((row) => row.status)).toEqual(["pending", "pending"]);
});

test("backfill aborts on its deadline, force-closes unready Redis, and reports no completed dispatch", async () => {
  const server = await createHangingRedisServer();
  stopExecutors.push(server.close);
  const result = await command("backfill", ["--deadline-ms", "100"], 1, {
    IAM_WORKER_REDIS_PORT: String(server.port),
  });
  expect(result.output).toContain('"signal":"deadline"');
  expect(result.output).not.toContain("Organization search backfill registered;");
  const changes = await harness.sql`SELECT status FROM organization_search_change`;
  expect([...changes]).toEqual([{ status: "pending" }, { status: "pending" }]);
});

test("repair handles interruption through the real CLI signal listener and closes stalled Redis", async () => {
  await module.processor.backfillAllOrganizations();
  const server = await createHangingRedisServer();
  stopExecutors.push(server.close);
  const result = await command("repair", [], 143, { IAM_WORKER_REDIS_PORT: String(server.port) }, [
    "--preload=./test-integration/process/interrupt-command.fixture.ts",
  ]);
  expect(result.output).toContain('"signal":"SIGTERM"');
  expect(result.output).not.toContain("Organization search repair wakeups finished;");
});

for (const stage of ["expand", "build"] as const) {
  test(`a killed Worker leaves ${stage} ownership recoverable and repeated repair converges through the ordinary consumer`, async () => {
    if (stage === "expand") {
      await renameRoot();
      await module.processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
    } else {
      // Expand normally without starting this module's consumers, then abandon the queued build in the child.
      await module.processor.backfillAllOrganizations();
      const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change`;
      for (const change of changes) await module.processor.processSourceChange({ changeId: change.id });
    }
    const reserved = await reserveWorkerPostgresConnection(harness, stopExecutors);
    const blocker = reserved.sql;
    let stopChild: (() => Promise<void>) | undefined;
    await blocker.unsafe("BEGIN");
    await blocker.unsafe("LOCK TABLE organization_closure IN ACCESS EXCLUSIVE MODE");
    const child = spawnOwnedProcessTree({
      executable: process.execPath,
      args: ["--no-env-file", "run", "test-integration/composition/organization-consumer.fixture.ts"],
      cwd: workerRoot,
      env: environment({
        IAM_WORKER_USER_PROFILE_CONCURRENCY: "1",
        IAM_WORKER_BULL_BOARD_PATH: "/admin/queues",
        IAM_WORKER_ENABLED_MODULES: "organization-search",
        IAM_WORKER_HTTP_ENABLED: "false",
        IAM_WORKER_BULL_BOARD_ENABLED: "false",
      }),
    });
    let closePromise: Promise<void> | undefined;
    stopChild = () => {
      closePromise ??= terminateProcessTree(child, { timeoutMs: 5000 });
      return closePromise;
    };
    stopExecutors.push(stopChild);
    const claimed = await until(async () => {
      const rows =
        stage === "expand"
          ? await harness.sql`SELECT status FROM organization_search_change WHERE status='processing'`
          : await harness.sql`SELECT status FROM organization_search_dirty WHERE status='processing'`;
      const locks = await harness.sql`SELECT count(*)::int AS blocked FROM pg_stat_activity
          WHERE wait_event_type='Lock' AND query LIKE '%organization_closure%' AND query NOT LIKE '%pg_stat_activity%'`;
      return rows.length && locks[0]?.blocked ? rows : undefined;
    });
    expect(claimed.length).toBeGreaterThan(0);
    await stopChild();
    await reserved.close();
    await command("repair", ["--stale-before", "2100-01-01T00:00:00Z"]);
    await module.startConsumers();
    const documents = await published("1", stage === "expand" ? "Recovered root" : "Root");
    await command("repair");
    const work = await harness.sql`SELECT version,status FROM organization_search_dirty ORDER BY organization_id`;
    expect(documents[0]?.organization.code).toBe("CHILD");
    expect([...work]).toEqual([
      { version: "1", status: "processed" },
      { version: "1", status: "processed" },
    ]);
  }, 45_000);
}
