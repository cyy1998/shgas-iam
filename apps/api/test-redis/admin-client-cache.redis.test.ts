import {
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAdminClientCache,
} from "../../admin-api/src/composition/runtime/client-cache";
import { createApiRedisTestHarness } from "./redis-test-harness";

describe("Admin client cache Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("invalidates generic keys and controls the Custom SSO mutation fence", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("admin");
      const clientSecret = `secret-${clientCode}`;
      const codeKey = `cache:client:code:${clientCode}`;
      const secretKey = `cache:client:secret:${clientSecret}`;
      scope.trackKey(codeKey);
      scope.trackKey(secretKey);
      await scope.redis.mset(
        codeKey,
        "cached",
        secretKey,
        "cached",
        customSsoClientRuntimeCacheKey(clientCode),
        "cached",
      );
      const cache = createAdminClientCache({ redis: scope.redis });

      await cache.invalidateClient({ clientCode, clientSecret });

      expect(await scope.observer.mget(
        codeKey,
        secretKey,
        customSsoClientRuntimeCacheKey(clientCode),
      )).toEqual([null, null, null]);
      expect(await scope.observer.get(
        customSsoClientRuntimeGenerationKey(clientCode),
      )).toBe("1");

      const mutation = await cache.beginRuntimeMutation(
        clientCode,
        "admin-mutation",
      );
      expect(await scope.observer.get(
        customSsoClientRuntimeMutationKey(clientCode),
      )).toBe("admin-mutation");
      expect(await cache.completeRuntimeMutation(mutation)).toBe("completed");
      expect(await scope.observer.get(
        customSsoClientRuntimeMutationKey(clientCode),
      )).toBeNull();
    }
    finally {
      await scope.close();
    }
  });

  test("heartbeats keep a long-running Admin mutation fenced past its original TTL", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("heartbeat");
      const cache = createAdminClientCache({
        redis: scope.redis,
        mutationFenceTtlMs: 300,
      });
      const mutation = await cache.beginRuntimeMutation(
        clientCode,
        "admin-long-running",
      );
      const heartbeat = cache.startRuntimeMutationHeartbeat(mutation);

      await Bun.sleep(800);

      expect(await heartbeat.assertOwned()).toBeUndefined();
      expect(await heartbeat.stopAndSettle(async () =>
        await cache.completeRuntimeMutation(mutation))).toBe("completed");
      expect(await scope.observer.get(
        customSsoClientRuntimeMutationKey(clientCode),
      )).toBeNull();
    }
    finally {
      await scope.close();
    }
  });
});
