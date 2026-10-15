import { afterEach, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
import { createWorkerPostgresTestHarness, reserveWorkerPostgresConnection } from "../postgres/postgres-test-harness";
import { resetWorkerRedisTestDatabase, resolveWorkerRedisTestUrl } from "../redis/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let queue: ReturnType<typeof createJobQueue>;
let stopExecutors: Array<() => Promise<void> | void>;
let redis: { host: string; port: number; db: number; password?: string; username?: string };
beforeEach(async () => {
  stopExecutors = [];
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
  redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  harness = await createWorkerPostgresTestHarness();
  stopExecutors.push(harness.close);
  queue = createJobQueue({ name: "organization-search", redis });
  stopExecutors.push(() => queue.close());
  await harness.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type)
    VALUES (1,'ROOT','Recovered root',-1,'/1',1,${OrganizationType.Department}),
      (2,'CHILD','Child',1,'/1/2',2,${OrganizationType.Department})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0)`;
  // Prior published facts and a committed change are sufficient to observe
  // preservation. The recovery suite owns producing and replaying this work.
  const root = { code: "ROOT", name: "Root", type: OrganizationType.Department, level: 1 };
  const child = { code: "CHILD", name: "Child", type: OrganizationType.Department, level: 2 };
  for (const [id, organization] of [
    [1, { ...root, path: [{ ...root, distanceToTarget: 0 }] }],
    [
      2,
      {
        ...child,
        path: [
          { ...root, distanceToTarget: 1 },
          { ...child, distanceToTarget: 0 },
        ],
      },
    ],
  ] as const) {
    const document = {
      organization: { ...organization, status: OrganizationStatus.Enable, isVirtual: false, isEntity: false },
    };
    await harness.sql`INSERT INTO organization_search_document
      (organization_id,document,schema_version,source_version,search_visible)
      VALUES (${id},${JSON.stringify(document)}::jsonb,1,1,true)`;
  }
  await harness.sql`INSERT INTO organization_search_dirty (organization_id,version,status,processed_at)
    VALUES (1,1,'processed',NOW()),(2,1,'processed',NOW())`;
  await harness.sql`INSERT INTO organization_search_change (id,organization_id,scope)
    VALUES ('11111111-1111-4111-8111-111111111111',1,'subtree')`;
});
afterEach(async () => {
  // A failed assertion/observer must not race fixture teardown with a live CLI.
  // Each process harness remains bounded and all started commands are awaited.
  if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
});

for (const mode of ["backfill", "repair"] as const)
  for (const control of ["deadline", "SIGTERM"] as const) {
    test(`${mode} ${control} releases its actual blocked PostgreSQL backend and preserves prior durable facts`, async () => {
      const before = await stocks();
      const jobsBefore = (await queue.getJobs()).map((job) => job.id).sort();
      const reserved = await reserveWorkerPostgresConnection(harness, stopExecutors);
      const blocker = reserved.sql;
      await runWithOwnedTestResources(async (lifecycle) => {
        lifecycle.registerCleanup(reserved.close);
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
      });
      const after = await stocks();
      const jobsAfter = (await queue.getJobs()).map((job) => job.id).sort();
      expect(after).toEqual(before);
      expect(jobsAfter).toEqual(jobsBefore);
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
  }, 20_000);
}

async function closedOwner(output: string) {
  const applicationName = output.match(/"applicationName":"([^"]+)"/u)?.[1];
  expect(applicationName).toBeDefined();
  if (!applicationName) throw new Error("Command did not identify its PG owner");
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
  stopExecutors.push(async () => {
    await pending;
  });
  void pending.catch(() => {}); // The caller and fixture teardown propagate rejection.
  return await pending;
}
