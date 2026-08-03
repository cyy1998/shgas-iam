import type { SubjectFactsReaderCachePort } from "../src/subject-facts";
import type {
  SubjectFactsCacheRecordV1,
  SubjectFactsPublisherPort,
} from "../src/worker";
import { randomUUID } from "node:crypto";
import process from "node:process";
import Redis from "ioredis";
import {
  createSubjectFactsRedisCache,
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
  SubjectFactsCacheRecordV1Schema,
} from "../src/worker";

const TEST_REDIS_URL_ENV = "IAM_USER_PROFILE_TEST_REDIS_URL";

export interface RedisTestScope {
  readonly firstCache: SubjectFactsReaderCachePort;
  readonly secondCache: SubjectFactsReaderCachePort;
  readonly firstPublisher: SubjectFactsPublisherPort;
  readonly secondPublisher: SubjectFactsPublisherPort;
  readonly batchPublisher: ReturnType<typeof createSubjectFactsRedisPublisher>;
  readonly inspector: ReturnType<typeof createSubjectFactsRedisInspector>;
  readonly readPublishedRecord: (
    subjectIdentifier: string,
  ) => Promise<SubjectFactsCacheRecordV1 | null>;
  readonly close: () => Promise<void>;
}

export interface RedisTestHarness {
  readonly createScope: () => Promise<RedisTestScope>;
  readonly close: () => Promise<void>;
}

export async function createRedisTestHarness(): Promise<RedisTestHarness> {
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
      const keyPrefix = `iam:test:user-profile:subject-facts:${randomUUID()}:`;
      const firstRedis = createRedisClient(redisUrl);
      const secondRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(firstRedis),
          connectRedis(secondRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        firstRedis.disconnect();
        secondRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      let closed = false;
      const firstCache = createSubjectFactsRedisCache(firstRedis, { keyPrefix });
      const secondCache = createSubjectFactsRedisCache(secondRedis, { keyPrefix });
      return {
        batchPublisher: createSubjectFactsRedisPublisher(firstRedis, { keyPrefix }),
        firstCache,
        secondCache,
        firstPublisher: firstCache,
        inspector: createSubjectFactsRedisInspector(observerRedis, { keyPrefix }),
        secondPublisher: secondCache,
        async readPublishedRecord(subjectIdentifier) {
          const stored = await observerRedis.get(`${keyPrefix}${subjectIdentifier}`);
          return stored === null
            ? null
            : SubjectFactsCacheRecordV1Schema.parse(JSON.parse(stored));
        },
        async close() {
          if (closed)
            return;
          closed = true;

          const errors: unknown[] = [];
          const closeResults = await Promise.allSettled([
            firstRedis.quit(),
            secondRedis.quit(),
            observerRedis.quit(),
          ]);
          for (const result of closeResults) {
            if (result.status === "rejected")
              errors.push(result.reason);
          }

          try {
            await deleteOwnedKeys(cleanupRedis, keyPrefix);
          }
          catch (error) {
            errors.push(error);
          }

          if (errors.length > 0)
            throw new AggregateError(errors, "Failed to close Subject Facts Redis test scope");
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
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${TEST_REDIS_URL_ENV} must use the redis or rediss protocol`);

  return redisUrl;
}

async function deleteOwnedKeys(redis: Redis, keyPrefix: string) {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${keyPrefix}*`,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0)
      await redis.unlink(...keys);
  } while (cursor !== "0");
}
