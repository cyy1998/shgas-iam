import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("User Profile PostgreSQL readiness production command", () => {
  let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createWorkerPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.sql.unsafe(
      "TRUNCATE TABLE user_profile_dirty, user_profile, \"user\" RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("passes an empty complete inventory without connecting to unavailable Redis", async () => {
    const result = await runProcessCommandSmoke({
      label: "Worker User Profile PostgreSQL readiness command",
      start() {
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            "src/commands/user-profile-readiness.ts",
            "verify-postgres",
          ],
          cwd: workerRoot,
          env: {
            ...process.env,
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
            IAM_WORKER_LOG_LEVEL: "info",
            IAM_WORKER_LOG_FORMAT: "json",
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

    expect(result.output).toContain("User Profile PostgreSQL gate completed");
    expect(result.output).toContain("\"version\":3");
    expect(result.output).toContain("\"status\":\"passed\"");
    expect(result.output).not.toContain("ECONNREFUSED");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
