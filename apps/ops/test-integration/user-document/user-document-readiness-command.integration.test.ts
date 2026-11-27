import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { PROCESS_SMOKE_TEST_TIMEOUT_MS } from "@iam/test-support/process-smoke-harness";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";
import { runOpsCommand } from "../support/run-ops-command";

describe("User Document PostgreSQL readiness production command", () => {
  let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createOpsPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  test(
    "passes an empty complete inventory without connecting to unavailable Redis",
    async () => {
      const result = await runOpsCommand({
        args: ["user-document", "verify-postgres"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          IAM_OPS_DATABASE_URL: harness.databaseUrl,
          IAM_OPS_LOG_LEVEL: "info",
          IAM_OPS_LOG_FORMAT: "json",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
        expectedExitCode: 0,
      });

      expect(result.output).toContain("User Document PostgreSQL gate completed");
      expect(result.output).toContain('"version":1');
      expect(result.output).toContain('"status":"passed"');
      expect(result.output).not.toContain("ECONNREFUSED");
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );
});
