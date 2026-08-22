import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { describe, expect, test } from "bun:test";
import { createUnavailableStorageCommandEnvironment } from "./worker-command-smoke-environment";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("Worker Profile V2 maintenance production composition smoke", () => {
  for (const operation of ["backfill", "verify-postgres", "verify-redis"] as const) {
    test(`fails closed before completing ${operation} when storage is unavailable`, async () => {
      const result = await runCommandSmoke(operation);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Profile V2 maintenance command shutting down");
      expect(result.output).toContain(
        "Profile V2 maintenance failed; inspect structured logs for the last safe cursor or gate report.",
      );
      expect(result.output).not.toContain("Profile V2 backfill batch completed");
      expect(result.output).not.toContain("Profile V2 PostgreSQL gate completed");
      expect(result.output).not.toContain("Profile V2 Redis and Subject Access gate completed");
      expect(result.output).not.toContain("user profile rebuild job processed");
    }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
  }
});

async function runCommandSmoke(
  operation: "backfill" | "verify-postgres" | "verify-redis",
) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-worker-profile-v2-command-smoke-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: `Worker Profile V2 ${operation} command`,
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "src/commands/profile-v2-maintenance.ts",
              operation,
              "--batch-size",
              "5",
            ],
            cwd: workerRoot,
            env: createUnavailableStorageCommandEnvironment({
              databaseUrl: "postgresql://iam:password@127.0.0.1:1/iam",
              temporaryDirectory,
            }),
          });
        },
        completionTimeoutMs: 30_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode: 1,
      });
    },
  });
}
