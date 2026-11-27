import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createAdminApiRuntime } from "@admin-api/composition/runtime";
import { readAdminApiEnv } from "@admin-api/env";
import { createLogger } from "@iam/runtime/logger";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { createAdminApiRedisTestHarness } from "../support/redis-test-harness";

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

      const env = readAdminApiEnv({
        NODE_ENV: "test",
        IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
        IAM_ADMIN_API_REDIS_URL: harness.redisUrl,
      });
      const logger = createLogger({ nodeEnv: "test", logLevel: "silent" });
      const runtime = createAdminApiRuntime({ env, logger, redis: scope.redis });
      await runtime.integrations.clientCache.invalidateUpdatedClient(
        { clientCode: oldClientCode, clientSecret: oldSecret },
        { clientCode: newClientCode, clientSecret: newSecret },
      );

      const deletedValues = await scope.observer.mget(...expectedDeletedKeys);
      const unrelatedValue = await scope.observer.get(unrelatedKey);
      expect(deletedValues).toEqual([null, null, null, null]);
      expect(unrelatedValue).toBe("unrelated");
    });
  });
});
