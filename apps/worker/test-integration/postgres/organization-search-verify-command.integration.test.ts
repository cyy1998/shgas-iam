import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { OrganizationType } from "@iam/contracts";
import {
  createOrganizationSearchProcessor,
  type OrganizationRebuildJobPayload,
  type OrganizationSourceChangeJobPayload,
} from "@iam/organization-search-read-model/worker";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let commands: ReturnType<typeof runProcessCommandSmoke>[];
beforeAll(async () => {
  harness = await createWorkerPostgresTestHarness();
});
beforeEach(async () => {
  commands = [];
  await harness.sql.unsafe(
    "TRUNCATE organization_search_change, organization_search_dirty, organization_search_document, organization_closure, organization RESTART IDENTITY CASCADE",
  );
  await harness.sql`INSERT INTO organization (id, org_code, org_name, path, level, org_type) VALUES (1, 'VERIFY', 'Verify', '/1', 1, ${OrganizationType.Department})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0)`;
});
afterEach(async () => {
  const failures: unknown[] = [];
  for (const result of await Promise.allSettled(commands)) {
    if (result.status === "rejected") failures.push(result.reason);
  }
  if (failures.length) throw new AggregateError(failures, "Organization verify CLI did not complete");
});
afterAll(async () => {
  await harness?.close();
});

test("the actual PG-only command reports full failure and success with read-only resources and closes connections", async () => {
  const beforeMissing = await inventory();
  const failed = await runVerify(1);
  const afterMissing = await inventory();
  expect(failed.output).toContain('"status":"failed"');
  expect(failed.output).toContain('"code":"missing-document"');
  expect(afterMissing).toEqual(beforeMissing);

  await publishAll();
  const beforePassed = await inventory();
  const passed = await runVerify(0);
  const afterPassed = await inventory();
  const sessions = await sessionsAfter(passed.output);
  expect(passed.output).toContain('"status":"passed"');
  expect(passed.output).toContain('"organizations":1');
  expect(passed.output).toContain("Organization search verification command shutting down");
  expect(passed.output).not.toContain("ECONNREFUSED");
  expect(afterPassed).toEqual(beforePassed);
  expect(Array.from(sessions)).toEqual([]);
}, 25_000);

test("verification deadline closes a blocked PostgreSQL transaction without reporting partial success or writing work", async () => {
  await publishAll();
  const before = await inventory();
  const result = await harness.sql.begin(async (tx) => {
    await tx`LOCK TABLE organization IN ACCESS EXCLUSIVE MODE`;
    return await runVerify(1, ["--deadline-ms", "100"]);
  });
  const after = await inventory();
  const sessions = await sessionsAfter(result.output);

  expect(result.output).toContain('"reason":"deadline"');
  expect(result.output).toContain("Organization search verification failed;");
  expect(result.output).not.toContain("Organization search full verification completed");
  expect(after).toEqual(before);
  expect(Array.from(sessions)).toEqual([]);
}, 20_000);

test("verification rejects query failures and closes the PG-only command without a completed full report", async () => {
  await harness.sql`ALTER TABLE organization_search_document RENAME TO organization_search_unavailable`;
  let result: Awaited<ReturnType<typeof runVerify>>;
  try {
    result = await runVerify(1);
  } finally {
    await harness.sql`ALTER TABLE organization_search_unavailable RENAME TO organization_search_document`;
  }
  const sessions = await sessionsAfter(result.output);

  expect(result.output).toContain("Organization search verification failed;");
  expect(result.output).toContain("Organization search verification command shutting down");
  expect(result.output).not.toContain("Organization search full verification completed");
  expect(Array.from(sessions)).toEqual([]);
}, 20_000);

test("the actual verification signal listener stops its blocked read and closes the command without writing work", async () => {
  await publishAll();
  const before = await inventory();
  const result = await harness.sql.begin(async (tx) => {
    await tx`LOCK TABLE organization IN ACCESS EXCLUSIVE MODE`;
    return await runVerify(143, [], ["--preload=./test-integration/process/interrupt-command.fixture.ts"]);
  });
  const after = await inventory();
  const sessions = await sessionsAfter(result.output);
  expect(result.output).toContain('"reason":"SIGTERM"');
  expect(result.output).not.toContain("Organization search full verification completed");
  expect(after).toEqual(before);
  expect(Array.from(sessions)).toEqual([]);
}, 20_000);

async function inventory() {
  const [row] = await harness.sql`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM organization t) AS organizations,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM organization_closure t) AS closures,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY organization_id), '[]') FROM organization_search_document t) AS documents,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY organization_id), '[]') FROM organization_search_dirty t) AS dirty,
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM organization_search_change t) AS changes`;
  return row;
}

async function sessionsAfter(output: string) {
  const applicationName = output.match(/"applicationName":"([^"]+)"/u)?.[1];
  expect(applicationName).toBeDefined();
  if (!applicationName) throw new Error("Verification did not report its owned application name");
  return await harness.sql`SELECT pid FROM pg_stat_activity WHERE application_name = ${applicationName} OR application_name = ${`${applicationName}-cancel`}`;
}

async function publishAll() {
  const changes: OrganizationSourceChangeJobPayload[] = [];
  const rebuilds: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationSearchProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueSourceChanges(payloads) {
        changes.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuilds.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  await processor.backfillAllOrganizations();
  for (const payload of changes) await processor.processSourceChange(payload);
  for (const payload of rebuilds) await processor.processRebuild(payload);
}

async function runVerify(expectedExitCode: number, args: string[] = [], bunArgs: string[] = []) {
  const url = new URL(harness.commandDatabaseUrl);
  url.searchParams.set(
    "options",
    `${url.searchParams.get("options")} -cdefault_transaction_read_only=on -capplication_name=verify_${harness.schemaName}`,
  );
  const pending = runProcessCommandSmoke({
    label: "Organization Search PostgreSQL verification",
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          ...bunArgs,
          "run",
          "src/commands/organization-search/organization-search-verify.ts",
          ...args,
        ],
        cwd: workerRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          IAM_WORKER_DATABASE_URL: url.toString(),
          IAM_WORKER_LOG_LEVEL: "info",
          IAM_WORKER_LOG_FORMAT: "json",
          IAM_WORKER_REDIS_HOST: "127.0.0.1",
          IAM_WORKER_REDIS_PORT: "1",
          IAM_WORKER_REDIS_DB: "invalid-unused",
          IAM_WORKER_USER_PROFILE_CONCURRENCY: "invalid-unused",
          IAM_WORKER_BULL_BOARD_PATH: "invalid-unused",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      }),
    completionTimeoutMs: 15_000,
    cleanupTimeoutMs: 5000,
    expectedExitCode,
    maxOutputBytes: 64 * 1024,
  });
  commands.push(pending);
  void pending.catch(() => {});
  return await pending;
}
