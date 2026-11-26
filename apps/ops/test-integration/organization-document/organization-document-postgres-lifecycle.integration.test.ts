import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
import { redisUrlString } from "@iam/runtime/redis/config";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { spawnOwnedProcessTree } from "@iam/test-support/process-smoke-harness";
import { runOpsCommandSmoke } from "../support/ops-command-smoke";
import {
  createOpsPostgresTestHarness,
  reserveOpsPostgresConnection,
  waitForOpsPostgresLock,
} from "../support/postgres-test-harness";
import { resetOpsRedisTestDatabase, resolveOpsRedisTestUrl } from "../support/redis-test-harness";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
let queue: ReturnType<typeof createJobQueue>;
let stopExecutors: Array<() => Promise<void> | void>;
let redis: { host: string; port: number; db: number; password?: string; username?: string };
beforeAll(async () => {
  harness = await createOpsPostgresTestHarness();
});
afterAll(async () => {
  await harness?.close();
});
beforeEach(async () => {
  stopExecutors = [];
  await harness.reset();
  redis = redisUrlString().parse(resolveOpsRedisTestUrl(process.env));
  queue = createJobQueue({ name: "organization-document", redis });
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
      ...organization,
      status: OrganizationStatus.Enable,
      isVirtual: false,
      isEntity: false,
    };
    await harness.sql`INSERT INTO organization_document
      (organization_id,document,schema_version,source_version,search_visible)
      VALUES (${id},${JSON.stringify(document)}::jsonb,1,1,true)`;
  }
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status,processed_at)
    VALUES (1,1,'processed',NOW()),(2,1,'processed',NOW())`;
  await harness.sql`INSERT INTO organization_document_outbox (id,organization_id,scope)
    VALUES ('11111111-1111-4111-8111-111111111111',1,'subtree')`;
});
afterEach(async () => {
  // A failed assertion/observer must not race fixture teardown with a live CLI.
  // Each process harness remains bounded and all started commands are awaited.
  if (stopExecutors.length) await resetOpsRedisTestDatabase(stopExecutors);
});

for (const mode of ["backfill", "repair"] as const)
  for (const control of ["deadline", "SIGTERM"] as const) {
    test(`${mode} ${control} releases its actual blocked PostgreSQL backend and preserves prior durable facts`, async () => {
      const before = await stocks();
      const jobsBefore = (await queue.getJobs()).map((job) => job.id).sort();
      const reserved = await reserveOpsPostgresConnection(harness, stopExecutors);
      const blocker = reserved.sql;
      await runWithOwnedTestResources(async (lifecycle) => {
        lifecycle.registerCleanup(reserved.close);
        await blocker.unsafe("BEGIN");
        await blocker.unsafe(
          mode === "backfill"
            ? "LOCK TABLE organization IN ACCESS EXCLUSIVE MODE"
            : "LOCK TABLE organization_document_outbox IN ACCESS EXCLUSIVE MODE",
        );
        let blockedOwner: string | undefined;
        const pending = command(
          mode,
          control === "deadline" ? 1 : 143,
          control === "deadline" ? ["--deadline-ms", "500"] : [],
          control === "SIGTERM"
            ? async (signal) => {
                blockedOwner = await waitForOpsPostgresLock(harness, "org", signal);
              }
            : undefined,
        );
        if (control === "deadline") {
          blockedOwner = await Promise.race([
            waitForOpsPostgresLock(harness, "org"),
            pending.then(() => {
              throw new Error("Command completed without an observed PostgreSQL lock wait");
            }),
          ]);
        }
        const result = await pending;
        expect(result.output).toContain(`"signal":"${control}"`);
        const applicationName = await closedOwner(result.output);
        expect(blockedOwner).toBe(applicationName);
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
    const renamed = mode === "backfill" ? "organization" : "organization_document_outbox";
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

async function stocks() {
  const [row] = await harness.sql`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization t) AS source,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY organization_id) FROM organization_document t) AS documents,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY organization_id) FROM organization_document_rebuild_state t) AS dirty,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization_document_outbox t) AS changes`;
  return row;
}
async function command(
  mode: "backfill" | "repair",
  expectedExitCode: number,
  args: string[] = [],
  interruptWhen?: (signal: AbortSignal) => Promise<void>,
) {
  const pending = runOpsCommandSmoke(
    {
      label: `Organization ${mode} PG lifecycle`,
      expectedExitCode,
      completionTimeoutMs: 5000,
      cleanupTimeoutMs: 5000,
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts", "organization-document", mode, ...args],
          cwd: opsRoot,
          env: {
            ...process.env,
            NODE_ENV: "test",
            IAM_OPS_DATABASE_URL: harness.databaseUrl,
            IAM_OPS_REDIS_URL: resolveOpsRedisTestUrl(process.env),
            IAM_OPS_LOG_FORMAT: "json",
            IAM_OPS_LOG_LEVEL: "info",
          },
        }),
    },
    interruptWhen,
  );
  stopExecutors.push(async () => {
    await pending;
  });
  void pending.catch(() => {}); // The caller and fixture teardown propagate rejection.
  return await pending;
}
