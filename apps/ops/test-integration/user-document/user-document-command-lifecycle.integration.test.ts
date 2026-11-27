import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { UserStatus } from "@iam/contracts";
import { createCurrentUserDocumentProjectionBundle } from "@iam/documents/user/worker";
import { createOpsPostgresTestHarness, waitForOpsPostgresLock } from "../support/postgres-test-harness";
import { resolveOpsRedisTestUrl } from "../support/redis-test-harness";
import { runOpsCommand } from "../support/run-ops-command";

let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOpsPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
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
      return await runVerify(1, ["--deadline-ms", "100"], operation);
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
      let blockedOwner: string | undefined;
      const interrupted = await runVerify(143, [], operation, async (signal) => {
        blockedOwner = await waitForOpsPostgresLock(harness, "user", signal);
      });
      const applicationName = interrupted.output.match(/"applicationName":"([^"]+)"/u)?.[1];
      if (!blockedOwner) throw new Error("Did not observe the blocked PostgreSQL owner");
      expect(applicationName).toBe(blockedOwner);
      const sessions = await harness.sql`SELECT pid FROM pg_stat_activity
        WHERE application_name=${blockedOwner} OR application_name=${`${blockedOwner}-cancel`}`;
      expect([...sessions]).toEqual([]);
      return interrupted;
    });
    const after = await inventory();
    expect(result.output).toContain('"reason":"SIGTERM"');
    expect(result.output).not.toContain('"publication":"not-verified"');
    expect(result.output).not.toContain("gate completed");
    expect(after).toEqual(before);
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
  operation = "verify-postgres",
  interruptWhen?: (signal: AbortSignal) => Promise<void>,
) {
  const readiness = operation.startsWith("verify-");
  const redisUrl = resolveOpsRedisTestUrl(process.env);
  return await runOpsCommand(
    {
      args: ["user-document", operation, ...args],
      env: {
        ...process.env,
        NODE_ENV: "test",
        IAM_OPS_DATABASE_URL: harness.databaseUrl,
        IAM_OPS_REDIS_URL: readiness ? "redis://127.0.0.1:1/0" : redisUrl,
        IAM_OPS_LOG_LEVEL: "info",
        IAM_OPS_LOG_FORMAT: "json",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      expectedExitCode,
    },
    interruptWhen,
  );
}

test.each([
  { args: ["verify-postgres"], shutdown: "User Document PostgreSQL readiness command shutting down" },
  { args: ["verify-redis"], shutdown: "User Document Redis readiness command shutting down" },
  { args: ["repair", "--subject-access-only", "--limit", "5"], shutdown: "Ops Subject Access repair shutting down" },
])("cleans up unavailable storage for $args without a completion report", async ({ args, shutdown }) => {
  const result = await runOpsCommand({
    args: ["user-document", ...args],
    env: {
      NODE_ENV: "test",
      IAM_OPS_DATABASE_URL: "postgres://iam:private-command-secret@127.0.0.1:1/iam_test",
      IAM_OPS_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_OPS_LOG_LEVEL: "info",
    },
    expectedExitCode: 1,
  });
  expect(result.output).toContain(shutdown);
  expect(result.output).toMatch(/User Document (?:readiness|repair) failed;/u);
  expect(result.output).not.toMatch(/gate completed|backlog processed|rebuild job processed|private-command-secret/u);
});
