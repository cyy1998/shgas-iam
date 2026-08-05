import { randomUUID } from "node:crypto";
import process from "node:process";
import Redis from "ioredis";

const OIDC_TEST_REDIS_URL_ENV = "IAM_OIDC_PROVIDER_TEST_REDIS_URL";

export interface OidcProviderRedisTestScope {
  readonly observer: Redis;
  readonly writer: Redis;
  readonly unique: (label: string) => string;
  readonly trackKey: (key: string) => void;
  readonly trackPrefix: (prefix: string) => void;
  readonly close: () => Promise<void>;
}

export interface OidcProviderRedisTestHarness {
  readonly createScope: () => Promise<OidcProviderRedisTestScope>;
  readonly close: () => Promise<void>;
}

export async function createOidcProviderRedisTestHarness(): Promise<OidcProviderRedisTestHarness> {
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
      const writer = createRedisClient(redisUrl);
      const observer = createRedisClient(redisUrl);
      try {
        await Promise.all([connectRedis(writer), connectRedis(observer)]);
      }
      catch (error) {
        writer.disconnect();
        observer.disconnect();
        throw error;
      }
      const ownedKeys = new Set<string>();
      const ownedPrefixes = new Set<string>();
      let sequence = 0;
      let closed = false;
      return {
        observer,
        writer,
        unique(label) {
          sequence += 1;
          return `test-${namespace}-${label}-${sequence}`;
        },
        trackKey(key) {
          ownedKeys.add(key);
        },
        trackPrefix(prefix) {
          ownedPrefixes.add(prefix);
        },
        async close() {
          if (closed)
            return;
          closed = true;
          const errors: unknown[] = [];
          try {
            if (ownedKeys.size > 0)
              await cleanupRedis.unlink(...ownedKeys);
            for (const prefix of ownedPrefixes)
              await deleteOwnedKeys(cleanupRedis, prefix);
          }
          catch (error) {
            errors.push(error);
          }
          const closeResults = await Promise.allSettled([writer.quit(), observer.quit()]);
          for (const result of closeResults) {
            if (result.status === "rejected")
              errors.push(result.reason);
          }
          if (errors.length > 0)
            throw new AggregateError(errors, "Failed to close OIDC Provider Redis test scope");
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
  const redisUrl = process.env[OIDC_TEST_REDIS_URL_ENV];
  if (!redisUrl) {
    throw new Error(
      `${OIDC_TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${OIDC_TEST_REDIS_URL_ENV} must use the redis or rediss protocol`);
  return redisUrl;
}

async function deleteOwnedKeys(redis: Redis, prefix: string) {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${prefix}*`,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0)
      await redis.unlink(...keys);
  } while (cursor !== "0");
}
