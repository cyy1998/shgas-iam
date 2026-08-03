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

const adminApiRoot = fileURLToPath(new URL("../", import.meta.url));

function createCompositionEnvironment(
  temporaryDirectory: string,
  redisPort: number,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: "1",
      IAM_ADMIN_API_REDIS_HOST: "127.0.0.1",
      IAM_ADMIN_API_REDIS_PORT: String(redisPort),
      IAM_ADMIN_API_REDIS_DB: "15",
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE:
        "sess:admin-api-cache-invalidation-smoke:",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID: "entry-smoke",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET:
        "admin-api-entry-smoke-secret-at-least-32-bytes",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

describe("Admin API production composition command smoke", () => {
  test("wires client code and secret cache invalidation through production composition", async () => {
    const redis = await createProcessSmokeRedisServer();
    try {
      await withOwnedTemporaryDirectory({
        prefix: "iam-admin-api-cache-invalidation-smoke-",
        cleanupTimeoutMs: 5_000,
        async run(temporaryDirectory) {
          const result = await runProcessCommandSmoke({
            label: "Admin API client cache invalidation composition",
            start: () => spawnOwnedProcessTree({
              executable: process.execPath,
              args: [
                "--no-env-file",
                "run",
                "test-smoke/client-cache-invalidation.composition-smoke.ts",
              ],
              cwd: adminApiRoot,
              env: createCompositionEnvironment(
                temporaryDirectory,
                redis.port,
              ),
            }),
            completionTimeoutMs: 20_000,
            cleanupTimeoutMs: 5_000,
          });
          expect(result.output).toContain("CLIENT_CACHE_INVALIDATION_OK");
        },
      });

      expect(redis.commands).toEqual(expect.arrayContaining([
        { name: "del", args: ["cache:client:code:alpha"] },
        { name: "del", args: ["cache:client:secret:alpha-secret"] },
        { name: "del", args: ["cache:client:code:before"] },
        { name: "del", args: ["cache:client:secret:before-secret"] },
        { name: "del", args: ["cache:client:code:after"] },
        { name: "del", args: ["cache:client:secret:after-secret"] },
      ]));
    }
    finally {
      await redis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
