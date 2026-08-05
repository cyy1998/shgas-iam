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

describe("Worker Subject Projection cutover production composition smoke", () => {
  test("fails closed without consuming a backfill batch when required storage is unavailable", async () => {
    const result = await runCutoverCommandSmoke("backfill");

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("worker shutting down");
    expect(result.output).toContain(
      "Subject Projection cutover failed; inspect structured logs for the last safe cursor.",
    );
    expect(result.output).not.toContain("Subject Projection cutover batch completed");
    expect(result.output).not.toContain("user profile rebuild job processed");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("fails closed without completing verification when required storage is unavailable", async () => {
    const result = await runCutoverCommandSmoke("verify");

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("worker shutting down");
    expect(result.output).toContain(
      "Subject Projection cutover failed; inspect structured logs for the last safe cursor.",
    );
    expect(result.output).not.toContain(
      "Subject Projection cutover verification completed",
    );
    expect(result.output).not.toContain("user profile rebuild job processed");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});

async function runCutoverCommandSmoke(operation: "backfill" | "verify") {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-worker-subject-projection-command-smoke-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      const manifestPath = `${temporaryDirectory}/cutover-manifest.json`;
      await Bun.write(manifestPath, JSON.stringify({
        version: 1,
        cutoverId: "subject-projection-smoke-v1",
        clients: [],
      }));
      return await runProcessCommandSmoke({
        label: `Worker Subject Projection ${operation} command`,
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "src/commands/subject-projection-cutover.ts",
              operation,
              "--manifest",
              manifestPath,
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
