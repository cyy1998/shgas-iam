import type { SubjectFactsCacheRecord } from "../../src/subject-facts";
import type {
  SubjectFactsCacheRecordV1,
} from "../../src/subject-facts/subject-facts-cache";
import type {
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "../../src/subject-facts/subject-facts-redis-publisher.core";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import Redis from "ioredis";
import {
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
  SubjectFactsCacheRecordSchema,
} from "../../src/subject-facts";
import { SubjectFactsCacheRecordV1Schema } from "../../src/subject-facts/subject-facts-cache";
import {
  createSubjectFactsRedisCache as createLegacySubjectFactsRedisCache,
  createSubjectFactsRedisInspector as createLegacySubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher as createLegacySubjectFactsRedisPublisher,
} from "../../src/subject-facts/subject-facts-redis.publisher";

const TEST_REDIS_URL_ENV = "IAM_USER_PROFILE_TEST_REDIS_URL";

export interface RedisTestScope {
  readonly projectionRedis: {
    readonly keyPrefix: string;
    readonly publisher: SubjectFactsRedisClient;
    readonly inspector: SubjectFactsRedisInspectionClient;
  };
  readonly firstCache: ReturnType<typeof createLegacySubjectFactsRedisCache>;
  readonly secondCache: ReturnType<typeof createLegacySubjectFactsRedisCache>;
  readonly firstPublisher: Pick<ReturnType<typeof createLegacySubjectFactsRedisPublisher>, "publish">;
  readonly secondPublisher: Pick<ReturnType<typeof createLegacySubjectFactsRedisPublisher>, "publish">;
  readonly batchPublisher: ReturnType<typeof createLegacySubjectFactsRedisPublisher>;
  readonly inspector: ReturnType<typeof createLegacySubjectFactsRedisInspector>;
  readonly firstProfilePublisher: ReturnType<typeof createSubjectFactsRedisPublisher>;
  readonly secondProfilePublisher: ReturnType<typeof createSubjectFactsRedisPublisher>;
  readonly subjectAccessBootstrap: ReturnType<typeof createSubjectAccessBootstrap>;
  readonly profileInspector: ReturnType<typeof createSubjectFactsRedisInspector>;
  readonly readPublishedRecord: (
    subjectIdentifier: string,
  ) => Promise<SubjectFactsCacheRecordV1 | null>;
  readonly readPublishedProfileRecord: (
    subjectIdentifier: string,
  ) => Promise<SubjectFactsCacheRecord | null>;
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
      const subjectAccessKeyPrefix = `iam:test:user-profile:subject-access:${randomUUID()}:`;
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
      const firstCache = createLegacySubjectFactsRedisCache(firstRedis, { keyPrefix });
      const secondCache = createLegacySubjectFactsRedisCache(secondRedis, { keyPrefix });
      return {
        batchPublisher: createLegacySubjectFactsRedisPublisher(firstRedis, { keyPrefix }),
        firstCache,
        secondCache,
        firstPublisher: firstCache,
        firstProfilePublisher: createSubjectFactsRedisPublisher(firstRedis, { keyPrefix }),
        inspector: createLegacySubjectFactsRedisInspector(observerRedis, { keyPrefix }),
        secondPublisher: secondCache,
        secondProfilePublisher: createSubjectFactsRedisPublisher(secondRedis, { keyPrefix }),
        subjectAccessBootstrap: createSubjectAccessBootstrap({
          redis: firstRedis,
          random: { uuid: randomUUID },
          keyPrefix: subjectAccessKeyPrefix,
        }),
        profileInspector: createSubjectFactsRedisInspector(observerRedis, { keyPrefix }),
        projectionRedis: {
          keyPrefix,
          publisher: firstRedis,
          inspector: observerRedis,
        },
        async readPublishedRecord(subjectIdentifier) {
          const stored = await observerRedis.get(`${keyPrefix}${subjectIdentifier}`);
          return stored === null
            ? null
            : SubjectFactsCacheRecordV1Schema.parse(JSON.parse(stored));
        },
        async readPublishedProfileRecord(subjectIdentifier) {
          const stored = await observerRedis.get(`${keyPrefix}${subjectIdentifier}`);
          return stored === null
            ? null
            : SubjectFactsCacheRecordSchema.parse(JSON.parse(stored));
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
            await deleteOwnedKeys(cleanupRedis, subjectAccessKeyPrefix);
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
