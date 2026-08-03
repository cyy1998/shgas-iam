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

const workerRoot = fileURLToPath(new URL("../", import.meta.url));

function createRepairCommandEnvironment(
  temporaryDirectory: string,
  redisPort: number,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL:
        "postgresql://iam:worker-repair-secret-must-not-log@127.0.0.1:1/iam",
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

describe("Worker production composition command smoke", () => {
  test("runs the PostgreSQL reaper before Redis backlog observation in production composition", async () => {
    const redis = await createProcessSmokeRedisServer({
      subjectAccessRepairBacklogMetrics: {
        count: 7,
        oldestAgeMs: 9_000,
      },
    });
    try {
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
                  "src/commands/user-profile-repair.ts",
                  "--subject-access-only",
                  "--limit",
                  "5",
                ],
                cwd: workerRoot,
                env: createRepairCommandEnvironment(
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

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(
        "Subject Access stale transition intent reap started",
      );
      expect(result.output).not.toContain(
        "Subject Access repair backlog observed before processing",
      );
      expect(result.output).not.toContain(
        "Subject Access transition recovery backlog processed",
      );
      expect(result.output).not.toContain(
        "Subject Access repair backlog processed",
      );
      expect(result.output).not.toContain("subject-access:v1:idx:repair");
      expect(result.output).not.toContain(
        "00000000-0000-4000-8000-000000000001",
      );
      expect(result.output).not.toContain("worker-repair-secret-must-not-log");
      expect(redis.commands.some(command =>
        command.name === "eval"
        && command.args[0]?.includes(
          "subject-access:inspect-repair-backlog",
        ),
      )).toBe(false);
      expect(redis.commands.some(command =>
        command.name === "eval"
        && command.args[0]?.includes(
          "subject-access:claim-transition-recovery",
        ),
      )).toBe(false);
      expect(redis.commands.some(command =>
        command.name === "eval"
        && command.args[0]?.includes("subject-access:claim-repair-subject"),
      )).toBe(false);
    }
    finally {
      await redis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
