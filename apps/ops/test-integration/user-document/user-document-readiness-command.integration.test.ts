import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
} from "@iam/test-support/process-smoke-harness";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("User Document PostgreSQL readiness production command", () => {
  let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createOpsPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.sql.unsafe(
      'TRUNCATE TABLE user_document_rebuild_state, user_document, "user" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  test(
    "passes an empty complete inventory without connecting to unavailable Redis",
    async () => {
      const result = await runProcessCommandSmoke({
        label: "Ops User Document PostgreSQL readiness command",
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts", "user-document", "verify-postgres"],
            cwd: opsRoot,
            env: {
              ...process.env,
              NODE_ENV: "test",
              IAM_OPS_DATABASE_URL: harness.commandDatabaseUrl,
              IAM_OPS_LOG_LEVEL: "info",
              IAM_OPS_LOG_FORMAT: "json",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          });
        },
        completionTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode: 0,
        maxOutputBytes: 64 * 1024,
      });

      expect(result.output).toContain("User Document PostgreSQL gate completed");
      expect(result.output).toContain('"version":1');
      expect(result.output).toContain('"status":"passed"');
      expect(result.output).not.toContain("ECONNREFUSED");
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );
});
