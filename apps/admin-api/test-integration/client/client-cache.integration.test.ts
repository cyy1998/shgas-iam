import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";
import { createAdminApiRedisTestHarness } from "../support/redis-test-harness";

const adminApiRoot = fileURLToPath(new URL("../../", import.meta.url));
describe("Admin client cache Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createAdminApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });
  afterEach(async () => {
    await harness.reset();
  });

  test("deletes exactly the four generic cache identities through the production update entry", async () => {
    const scope = await harness.createScope();
    await runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(() => scope.close());
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

      await runCacheRuntimeEntry(["update", oldClientCode, oldSecret, newClientCode, newSecret], harness.redisUrl);

      const deletedValues = await scope.observer.mget(...expectedDeletedKeys);
      const unrelatedValue = await scope.observer.get(unrelatedKey);
      expect(deletedValues).toEqual([null, null, null, null]);
      expect(unrelatedValue).toBe("unrelated");
    });
  });
});
async function runCacheRuntimeEntry(args: string[], redisUrl: string) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-admin-api-cache-entry-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      const result = await runProcessCommandSmoke({
        label: "Admin API real Redis client cache runtime",
        start: () =>
          spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "test-integration/client/client-cache-invalidation.fixture.ts", ...args],
            cwd: adminApiRoot,
            env: createCacheRuntimeEnvironment(temporaryDirectory, redisUrl),
          }),
        completionTimeoutMs: 20_000,
        cleanupTimeoutMs: 5_000,
      });
      expect(result.output).toContain("CLIENT_CACHE_INVALIDATION_OK");
    },
  });
}

function createCacheRuntimeEnvironment(temporaryDirectory: string, redisUrl: string) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: "1",
      IAM_ADMIN_API_REDIS_URL: redisUrl,
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
