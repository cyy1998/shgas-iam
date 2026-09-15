import type { DedicatedRedisTestConfig } from "@iam/api-core/testing/external-test-resources";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createProcessSmokeEnvironment, runProcessCommandSmoke, spawnOwnedProcessTree, withOwnedTemporaryDirectory } from "@iam/api-core/testing/process-smoke-harness";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createAdminApiRedisTestHarness } from "./redis-test-harness";

const adminApiRoot = fileURLToPath(new URL("../../", import.meta.url));
describe("Admin client cache Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createAdminApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("restores the caller-owned Redis inventory after invalidation", async () => {
    const scope = await harness.createScope();
    const before = await harness.inventoryKeys();
    try {
      const clientCode = scope.clientCode("inventory");
      await runCacheRuntimeEntry(
        ["invalidate", clientCode, `secret-${clientCode}`],
        harness.redisConfig,
      );
    }
    finally {
      await scope.close();
    }

    const after = await harness.inventoryKeys();
    expect([...after].filter(key => !before.has(key))).toEqual([]);
    expect([...before].filter(key => !after.has(key))).toEqual([]);
  });

  test("deletes exactly the four generic cache identities through the production update entry", async () => {
    const scope = await harness.createScope();
    try {
      const oldClientCode = scope.clientCode("update-old");
      const newClientCode = scope.clientCode("update-new");
      const oldSecret = `secret-${oldClientCode}`;
      const newSecret = `secret-${newClientCode}`;
      const expectedDeletedKeys = [
        `cache:client:code:${oldClientCode}`,
        `cache:client:secret:${oldSecret}`,
        `cache:client:code:${newClientCode}`,
        `cache:client:secret:${newSecret}`,
      ] as const;
      const unrelatedKey = `cache:client:code:${scope.clientCode("unrelated")}`;
      await scope.redis.mset(
        expectedDeletedKeys[0],
        "old-code",
        expectedDeletedKeys[1],
        "old-secret",
        expectedDeletedKeys[2],
        "new-code",
        expectedDeletedKeys[3],
        "new-secret",
        unrelatedKey,
        "unrelated",
      );

      await runCacheRuntimeEntry(
        ["update", oldClientCode, oldSecret, newClientCode, newSecret],
        harness.redisConfig,
      );

      const deletedValues = await scope.observer.mget(...expectedDeletedKeys);
      const unrelatedValue = await scope.observer.get(unrelatedKey);
      expect(deletedValues).toEqual([null, null, null, null]);
      expect(unrelatedValue).toBe("unrelated");
    }
    finally {
      await scope.close();
    }
  });
});
async function runCacheRuntimeEntry(
  args: string[],
  redisConfig: DedicatedRedisTestConfig,
) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-admin-api-cache-entry-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      const result = await runProcessCommandSmoke({
        label: "Admin API real Redis client cache runtime",
        start: () => spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            "test-smoke/client-cache-invalidation.runtime-smoke.ts",
            ...args,
          ],
          cwd: adminApiRoot,
          env: createCacheRuntimeEnvironment(temporaryDirectory, redisConfig),
        }),
        completionTimeoutMs: 20_000,
        cleanupTimeoutMs: 5_000,
      });
      expect(result.output).toContain("CLIENT_CACHE_INVALIDATION_OK");
    },
  });
}

function createCacheRuntimeEnvironment(
  temporaryDirectory: string,
  redisConfig: DedicatedRedisTestConfig,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: "1",
      IAM_ADMIN_API_REDIS_HOST: redisConfig.host,
      IAM_ADMIN_API_REDIS_PORT: String(redisConfig.port),
      IAM_ADMIN_API_REDIS_DB: String(redisConfig.db),
      IAM_ADMIN_API_REDIS_PASSWORD: redisConfig.password,
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: "sess:admin-api-cache-entry:",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}
