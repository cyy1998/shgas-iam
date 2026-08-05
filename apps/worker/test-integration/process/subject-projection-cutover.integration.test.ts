import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import {
  createProcessSmokeRedisServer,
} from "@iam/api-core/testing/process-smoke-redis-server";
import { describe, expect, test } from "bun:test";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

function createCutoverCommandEnvironment(
  temporaryDirectory: string,
  redisPort: number,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_WORKER_REDIS_HOST: "127.0.0.1",
      IAM_WORKER_REDIS_PORT: String(redisPort),
      IAM_WORKER_REDIS_DB: "15",
      IAM_WORKER_ENABLED_MODULES: "none",
      IAM_WORKER_HTTP_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
      IAM_WORKER_LOG_LEVEL: "info",
      IAM_WORKER_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

describe("Worker Subject Projection cutover production composition smoke", () => {
  test("fails closed when the production Client cutover cannot reach PostgreSQL", async () => {
    const result = await runCutoverCommandSmoke("backfill");

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Subject Projection client manifest failed");
    expect(result.output).toContain("worker shutting down");
    expect(result.output).toContain(
      "Subject Projection cutover failed; inspect structured logs for the last safe cursor.",
    );
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("fails closed when the production verifier cannot reach PostgreSQL", async () => {
    const result = await runCutoverCommandSmoke("verify");

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "Subject Projection cutover verification started",
    );
    expect(result.output).toContain("worker shutting down");
    expect(result.output).toContain(
      "Subject Projection cutover failed; inspect structured logs for the last safe cursor.",
    );
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});

async function runCutoverCommandSmoke(operation: "backfill" | "verify") {
  const redis = await createProcessSmokeRedisServer();
  try {
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
              env: createCutoverCommandEnvironment(
                temporaryDirectory,
                redis.port,
              ),
            });
          },
          completionTimeoutMs: 30_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode: 1,
        });
      },
    });
  }
  finally {
    await redis.close();
  }
}
