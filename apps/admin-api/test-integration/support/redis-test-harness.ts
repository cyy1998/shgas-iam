import {
  createExclusiveRedisTestHarness,
  parseDedicatedRedisTestUrl,
  TEST_REDIS_URL_ENV,
} from "@iam/test-support/external-test-resources";

export type AdminApiRedisTestHarness = Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
export type AdminApiRedisTestScope = Awaited<ReturnType<AdminApiRedisTestHarness["createScope"]>>;

export async function createAdminApiRedisTestHarness() {
  const harness = createExclusiveRedisTestHarness();
  return {
    ...harness,
    redisUrl: harness.url,
    redisConfig: parseDedicatedRedisTestUrl({ name: TEST_REDIS_URL_ENV, value: harness.url }),
    async createScope() {
      const { clients, clientCode, close } = await harness.openScope("admin-api", ["redis", "observer"]);
      return { ...clients, clientCode, close };
    },
  };
}
