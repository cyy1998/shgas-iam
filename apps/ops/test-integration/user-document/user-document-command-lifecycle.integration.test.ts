import { afterAll, beforeAll, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { UserStatus } from "@iam/contracts";
import { createCurrentUserDocumentProjectionBundle } from "@iam/user-document/worker";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";
import { resolveOpsRedisTestUrl } from "../support/redis-test-harness";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOpsPostgresTestHarness();
  await harness.sql`INSERT INTO "user" (id,subject_identifier,username,name,status,is_delete)
    VALUES (1,'00000000-0000-4000-8000-000000000001','lifecycle','Existing user',${UserStatus.Enable},false)`;
  const projection = createCurrentUserDocumentProjectionBundle();
  const document = await projection
    .createBuilder({ db: harness.db, clock: { nowDate: () => new Date() }, batchSize: 1 })
    .buildOne({ userId: 1, sourceVersion: "1" });
  if (!document) throw new Error("Lifecycle fixture failed to build");
  await projection.createRowRepository(harness.db).upsert(document);
  await harness.sql`INSERT INTO user_document_rebuild_state
    (user_id,version,status,processed_at,post_publication_version,post_publication_status,post_publication_completed_at)
    VALUES (1,1,'processed',NOW(),1,'processed',NOW())`;
  await harness.sql`INSERT INTO user_document_outbox (id,source)
    VALUES ('00000000-0000-4000-8000-000000000101','{"change":{"kind":"user","userId":1}}')`;
});
afterAll(async () => {
  await harness?.close();
});

test("the actual User Document verification deadline cancels only its owned blocked read and never reports partial success", async () => {
  const before = await inventory();
  const result = await harness.sql.begin(async (tx) => {
    await tx`LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE`;
    return await runVerify(1, ["--deadline-ms", "100"]);
  });
  const after = await inventory();
  expect(result.output).toContain('"reason":"deadline"');
  expect(result.output).not.toContain("PostgreSQL gate completed");
  expect(after).toEqual(before);
  const applicationName = result.output.match(/"applicationName":"([^"]+)"/u)?.[1];
  expect(applicationName).toBeDefined();
  if (!applicationName) throw new Error("Command omitted its PostgreSQL owner");
  const sessions = await harness.sql`SELECT pid FROM pg_stat_activity
    WHERE application_name=${applicationName} OR application_name=${`${applicationName}-cancel`}`;
  expect([...sessions]).toEqual([]);
}, 20_000);

for (const operation of ["backfill", "repair"] as const) {
  test(`the actual ${operation} deadline closes its blocked backend and preserves durable work for retry`, async () => {
    const before = await inventory();
    const result = await harness.sql.begin(async (tx) => {
      if (operation === "backfill") await tx`LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE`;
      else await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
      return await runVerify(1, ["--deadline-ms", "100"], [], operation);
    });
    const after = await inventory();
    expect(result.output).toContain('"reason":"deadline"');
    expect(result.output).not.toContain('"publication":"not-verified"');
    expect(after).toEqual(before);
  }, 20_000);
}

for (const operation of ["verify-postgres", "backfill", "repair"] as const) {
  test(`the actual ${operation} signal listener cancels its blocked operation and preserves prior work`, async () => {
    const before = await inventory();
    const result = await harness.sql.begin(async (tx) => {
      if (operation === "repair") await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
      else await tx`LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE`;
      return await runVerify(143, [], ["--preload=./test-integration/support/interrupt-command.fixture.ts"], operation);
    });
    const after = await inventory();
    expect(result.output).toContain('"reason":"SIGTERM"');
    expect(result.output).not.toContain('"publication":"not-verified"');
    expect(result.output).not.toContain("gate completed");
    expect(after).toEqual(before);
    const applicationName = result.output.match(/"applicationName":"([^"]+)"/u)?.[1];
    if (!applicationName) throw new Error("Command omitted its PostgreSQL owner");
    const sessions = await harness.sql`SELECT pid FROM pg_stat_activity
      WHERE application_name=${applicationName} OR application_name=${`${applicationName}-cancel`}`;
    expect([...sessions]).toEqual([]);
  }, 20_000);
}

async function inventory() {
  const [row] = await harness.sql`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "user" t) AS source,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_document t) AS documents,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_document_rebuild_state t) AS states,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM user_document_outbox t) AS outbox`;
  return row;
}

async function runVerify(
  expectedExitCode: number,
  args: string[],
  bunArgs: string[] = [],
  operation = "verify-postgres",
) {
  const readiness = operation.startsWith("verify-");
  const redisUrl = new URL(resolveOpsRedisTestUrl(process.env));
  return await runProcessCommandSmoke({
    label: "User Document verification lifecycle",
    expectedExitCode,
    completionTimeoutMs: 10_000,
    cleanupTimeoutMs: 5_000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          ...bunArgs,
          "run",
          "src/index.ts",
          "user-document",
          operation,

          ...args,
        ],
        cwd: opsRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          IAM_OPS_DATABASE_URL: harness.commandDatabaseUrl,
          IAM_OPS_REDIS_HOST: readiness ? "127.0.0.1" : redisUrl.hostname,
          IAM_OPS_REDIS_PORT: readiness ? "1" : redisUrl.port,
          IAM_OPS_REDIS_DB: readiness ? "0" : redisUrl.pathname.slice(1),
          IAM_OPS_REDIS_PASSWORD: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
          IAM_OPS_LOG_LEVEL: "info",
          IAM_OPS_LOG_FORMAT: "json",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      }),
  });
}
