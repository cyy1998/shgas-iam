import type {
  DedicatedRedisTestConfig,
} from "@iam/api-core/testing/external-test-resources";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  cleanupRedisKeysMatchingOwnerMarkers,
  createRedisKeyInventoryPort,
  inventoryRedisKeys,
  parseDedicatedRedisTestUrl,
  requireExternalTestUrl,
} from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";

const DEFAULT_TEST_REDIS_URL_ENV = "IAM_ADMIN_API_TEST_REDIS_URL";
type AdminApiRedisTestResourceEnvName
  = | "IAM_ADMIN_API_TEST_REDIS_URL"
    | "IAM_API_CORE_TEST_REDIS_URL";

export interface AdminApiRedisTestScope {
  readonly redis: Redis;
  readonly observer: Redis;
  readonly clientCode: (label: string) => string;
  readonly close: () => Promise<void>;
}

export interface AdminApiRedisTestHarness {
  readonly createScope: () => Promise<AdminApiRedisTestScope>;
  readonly close: () => Promise<void>;
  readonly inventoryKeys: () => Promise<Set<string>>;
  readonly removeKeys: (keys: readonly string[]) => Promise<void>;
  readonly redisConfig: DedicatedRedisTestConfig;
}

export async function createAdminApiRedisTestHarness(options?: {
  readonly resourceEnvName?: AdminApiRedisTestResourceEnvName;
}):
Promise<AdminApiRedisTestHarness> {
  const resourceEnvName = options?.resourceEnvName ?? DEFAULT_TEST_REDIS_URL_ENV;
  const redisUrl = requireDedicatedRedisTestUrl(resourceEnvName);
  const redisConfig = parseDedicatedRedisTestUrl({
    name: resourceEnvName,
    value: redisUrl,
  });
  const cleanupRedis = createRedisClient(redisUrl);
  try {
    await connectRedis(cleanupRedis);
  }
  catch (error) {
    cleanupRedis.disconnect();
    throw error;
  }

  return {
    redisConfig,
    async inventoryKeys() {
      return await inventoryRedisKeys(
        createRedisKeyInventoryPort(cleanupRedis),
      );
    },
    async removeKeys(keys) {
      if (keys.length > 0)
        await cleanupRedis.unlink(...keys);
    },
    async createScope() {
      const ownerMarker = `admin-api-${randomUUID().replaceAll("-", "")}`;
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

      let sequence = 0;
      let closed = false;
      return {
        redis,
        observer,
        clientCode(label) {
          sequence += 1;
          return `${ownerMarker}-${label}-${sequence}`;
        },
        async close() {
          if (closed)
            return;
          closed = true;
          const errors: unknown[] = [];
          try {
            await cleanupRedisKeysMatchingOwnerMarkers({
              diagnosticLabel: "Admin API Redis test",
              ownerMarkers: new Set([ownerMarker]),
              redis: createRedisKeyInventoryPort(cleanupRedis),
            });
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
              "Failed to close Admin API Redis test scope",
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

function requireDedicatedRedisTestUrl(
  resourceEnvName: AdminApiRedisTestResourceEnvName,
) {
  const redisUrl = requireExternalTestUrl({
    environment: process.env,
    lane: "Admin API Redis Integration",
    name: resourceEnvName,
  });
  return redisUrl;
}
