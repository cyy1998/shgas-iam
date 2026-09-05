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

describe("Worker production composition command smoke", () => {
  test("exits without consuming work when required storage is unavailable", async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-worker-repair-command-smoke-",
      cleanupTimeoutMs: 5_000,
      async run(temporaryDirectory) {
        return await runProcessCommandSmoke({
          label: "Worker Subject Access repair command",
          start() {
            return spawnOwnedProcessTree({
              executable: process.execPath,
              args: [
                "--no-env-file",
                "run",
                "src/commands/user-profile/user-profile-repair.ts",
                "--subject-access-only",
                "--limit",
                "5",
              ],
              cwd: workerRoot,
              env: createUnavailableStorageCommandEnvironment({
                databaseUrl:
                  "postgresql://iam:worker-repair-secret-must-not-log@127.0.0.1:1/iam",
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

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("ECONNREFUSED");
    expect(result.output).toContain(
      "worker Subject Access repair shutting down",
    );
    expect(result.output).not.toContain(
      "Subject Access transition recovery backlog processed",
    );
    expect(result.output).not.toContain("Subject Access repair backlog processed");
    expect(result.output).not.toContain("user profile rebuild job processed");
    expect(result.output).not.toContain("subject-access:v1:idx:repair");
    expect(result.output).not.toContain(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(result.output).not.toContain("worker-repair-secret-must-not-log");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
