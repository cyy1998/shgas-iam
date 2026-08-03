import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import Redis from "ioredis";

const TEST_REDIS_URL_ENV = "IAM_API_TEST_REDIS_URL";

export interface ApiRedisTestScope {
  readonly redis: Redis;
  readonly observer: Redis;
  readonly clientCode: (label: string) => string;
  readonly trackKey: (key: string) => void;
  readonly close: () => Promise<void>;
}

export interface ApiRedisTestHarness {
  readonly createScope: () => Promise<ApiRedisTestScope>;
  readonly close: () => Promise<void>;
}

export async function createApiRedisTestHarness():
Promise<ApiRedisTestHarness> {
  const redisUrl = requireDedicatedRedisTestUrl();
  const cleanupRedis = createRedisClient(redisUrl);
  try {
    await connectRedis(cleanupRedis);
  }
  catch (error) {
    cleanupRedis.disconnect();
    throw error;
  }

  return {
    async createScope() {
      const namespace = randomUUID().replaceAll("-", "");
      const redis = createRedisClient(redisUrl);
      const observer = createRedisClient(redisUrl);
      try {
        await Promise.all([
          connectRedis(redis),
          connectRedis(observer),
        ]);
      }
      catch (error) {
        redis.disconnect();
        observer.disconnect();
        throw error;
      }

      const ownedKeys = new Set<string>();
      let sequence = 0;
      let closed = false;
      return {
        redis,
        observer,
        clientCode(label) {
          sequence += 1;
          const code = `t${namespace.slice(0, 20)}-${label}-${sequence}`;
          ownedKeys.add(customSsoClientRuntimeCacheKey(code));
          ownedKeys.add(customSsoClientRuntimeGenerationKey(code));
          ownedKeys.add(customSsoClientRuntimeMutationKey(code));
          return code;
        },
        trackKey(key) {
          ownedKeys.add(key);
        },
        async close() {
          if (closed)
            return;
          closed = true;
          const errors: unknown[] = [];
          try {
            if (ownedKeys.size > 0)
              await cleanupRedis.unlink(...ownedKeys);
          }
          catch (error) {
            errors.push(error);
          }
          const closeResults = await Promise.allSettled([
            redis.quit(),
            observer.quit(),
          ]);
          for (const result of closeResults) {
            if (result.status === "rejected")
              errors.push(result.reason);
          }
          if (errors.length > 0) {
            throw new AggregateError(
              errors,
              "Failed to close API Redis test scope",
            );
          }
        },
      };
    },
    async close() {
      await cleanupRedis.quit();
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

function requireDedicatedRedisTestUrl() {
  const redisUrl = process.env[TEST_REDIS_URL_ENV];
  if (!redisUrl) {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must use the redis or rediss protocol`,
    );
  }
  return redisUrl;
}
