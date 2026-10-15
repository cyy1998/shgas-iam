import { randomUUID } from "node:crypto";
import process from "node:process";
import type { DedicatedRedisTestConfig } from "@iam/api-core/testing/external-test-resources";
import {
  parseDedicatedRedisTestUrl,
  requireExternalTestUrl,
  resetExclusiveRedisTestDatabase,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";

const DEFAULT_TEST_REDIS_URL_ENV = "IAM_ADMIN_API_TEST_REDIS_URL";
type AdminApiRedisTestResourceEnvName = "IAM_ADMIN_API_TEST_REDIS_URL" | "IAM_API_CORE_TEST_REDIS_URL";

export interface AdminApiRedisTestScope {
  readonly redis: Redis;
  readonly observer: Redis;
  readonly clientCode: (label: string) => string;
  readonly close: () => Promise<void>;
}

export interface AdminApiRedisTestHarness {
  readonly createScope: () => Promise<AdminApiRedisTestScope>;
  readonly close: () => Promise<void>;
  readonly reset: () => Promise<void>;
  readonly registerStopExecutor: (stop: () => Promise<void>) => () => Promise<void>;
  readonly redisConfig: DedicatedRedisTestConfig;
}

export async function createAdminApiRedisTestHarness(options?: {
  readonly resourceEnvName?: AdminApiRedisTestResourceEnvName;
}): Promise<AdminApiRedisTestHarness> {
  const resourceEnvName = options?.resourceEnvName ?? DEFAULT_TEST_REDIS_URL_ENV;
  const redisUrl = requireDedicatedRedisTestUrl(resourceEnvName);
  const redisConfig = parseDedicatedRedisTestUrl({
    name: resourceEnvName,
    value: redisUrl,
  });
  const stopExecutors: Array<() => Promise<void>> = [];
  function registerStopExecutor(stop: () => Promise<void>) {
    let closing: Promise<void> | undefined;
    const close = () => {
      closing ??= Promise.resolve().then(stop);
      return closing;
    };
    stopExecutors.push(close);
    return close;
  }

  return {
    redisConfig,
    registerStopExecutor,
    async createScope() {
      const caseId = `admin-api-${randomUUID().replaceAll("-", "")}`;
      const redis = createRedisClient(redisUrl);
      const observer = createRedisClient(redisUrl);
      const close = registerStopExecutor(() =>
        runWithOwnedTestResources(async (lifecycle) => {
          lifecycle.registerCleanup(() => closeRedis(redis));
          lifecycle.registerCleanup(() => closeRedis(observer));
        }),
      );
      try {
        const connections = await Promise.allSettled([connectRedis(redis), connectRedis(observer)]);
        const failures = connections.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
        if (failures.length > 0) throw new AggregateError(failures, "Admin API Redis scope setup failed");
      } catch (error) {
        return await runWithOwnedTestResources(async (lifecycle) => {
          lifecycle.registerCleanup(close);
          throw error;
        });
      }

      let sequence = 0;
      return {
        redis,
        observer,
        clientCode(label) {
          sequence += 1;
          return `${caseId}-${label}-${sequence}`;
        },
        close,
      };
    },
    async reset() {
      const control = createRedisClient(redisUrl);
      await runWithOwnedTestResources(async (lifecycle) => {
        lifecycle.registerCleanup(() => closeRedis(control));
        await resetExclusiveRedisTestDatabase({
          redis: {
            async flushdb() {
              await connectRedis(control);
              return await control.flushdb();
            },
          },
          stopExecutors,
        });
      });
      stopExecutors.length = 0;
    },
    async close() {
      await runWithOwnedTestResources(async (lifecycle) => {
        for (const stop of stopExecutors) lifecycle.registerCleanup(stop);
      });
    },
  };
}

function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
}

async function connectRedis(redis: Redis) {
  await redis.connect();
  await redis.ping();
}

async function closeRedis(redis: Redis) {
  try {
    if (redis.status === "ready") await redis.quit();
  } finally {
    redis.disconnect();
  }
}

function requireDedicatedRedisTestUrl(resourceEnvName: AdminApiRedisTestResourceEnvName) {
  const redisUrl = requireExternalTestUrl({
    environment: process.env,
    lane: "Admin API Redis Integration",
    name: resourceEnvName,
  });
  return redisUrl;
}
