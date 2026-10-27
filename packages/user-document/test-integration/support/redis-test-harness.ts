import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
} from "@iam/api-core/subject-access";
import {
  resetExclusiveRedisTestDatabase,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";
import type { DocumentFactsCacheRecord } from "../../src/subject-facts";
import {
  createSubjectFactsRedisCache,
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
  DocumentFactsCacheRecordSchema,
} from "../../src/subject-facts";
import type {
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "../../src/subject-facts/subject-facts-redis-publisher.core";

const TEST_REDIS_URL_ENV = "IAM_USER_DOCUMENT_TEST_REDIS_URL";

export interface RedisTestScope {
  readonly projectionRedis: {
    readonly keyPrefix: string;
    readonly publisher: SubjectFactsRedisClient;
    readonly inspector: SubjectFactsRedisInspectionClient;
  };
  readonly firstCache: ReturnType<typeof createSubjectFactsRedisCache>;
  readonly secondCache: ReturnType<typeof createSubjectFactsRedisCache>;
  readonly firstFactsPublisher: ReturnType<typeof createSubjectFactsRedisPublisher>;
  readonly secondFactsPublisher: ReturnType<typeof createSubjectFactsRedisPublisher>;
  readonly subjectAccessBootstrap: ReturnType<typeof createSubjectAccessBootstrap>;
  readonly subjectAccessStore: ReturnType<typeof createRedisSubjectAccessStore>;
  readonly subjectAccessBarrier: ReturnType<typeof createSubjectAccessBarrier>;
  readonly factsInspector: ReturnType<typeof createSubjectFactsRedisInspector>;
  readonly readPublishedUserDocumentRecord: (subjectIdentifier: string) => Promise<DocumentFactsCacheRecord | null>;
  readonly clearPublishedUserDocumentRecord: (subjectIdentifier: string) => Promise<void>;
  readonly expirePublishedUserDocumentRecord: (subjectIdentifier: string, ttlMs: number) => Promise<void>;
  readonly readPublishedUserDocumentTtl: (subjectIdentifier: string) => Promise<number>;
  readonly close: () => Promise<void>;
}

export interface RedisTestHarness {
  readonly createScope: () => Promise<RedisTestScope>;
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createRedisTestHarness(): Promise<RedisTestHarness> {
  const redisUrl = requireDedicatedRedisTestUrl();
  const scopeClosers: Array<() => Promise<void>> = [];

  return {
    async createScope() {
      const keyPrefix = `iam:test:user-document:subject-facts:${randomUUID()}:`;
      const subjectAccessKeyPrefix = `iam:test:user-document:subject-access:${randomUUID()}:`;
      const firstRedis = createRedisClient(redisUrl);
      const secondRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);
      let closePromise: Promise<void> | undefined;
      function close() {
        closePromise ??= runWithOwnedTestResources(async ({ registerCleanup }) => {
          for (const client of [firstRedis, secondRedis, observerRedis]) {
            registerCleanup(() => closeRedisClient(client));
          }
        });
        return closePromise;
      }
      scopeClosers.push(close);

      try {
        await Promise.all([connectRedis(firstRedis), connectRedis(secondRedis), connectRedis(observerRedis)]);
      } catch (error) {
        return await runWithOwnedTestResources<RedisTestScope>(async ({ registerCleanup }) => {
          registerCleanup(close);
          throw error;
        });
      }

      const firstCache = createSubjectFactsRedisCache(firstRedis, { keyPrefix });
      const secondCache = createSubjectFactsRedisCache(secondRedis, { keyPrefix });
      const subjectAccessStore = createRedisSubjectAccessStore({
        redis: firstRedis,
        keyPrefix: subjectAccessKeyPrefix,
      });
      const subjectAccessBarrier = createSubjectAccessBarrier({
        store: subjectAccessStore,
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
      return {
        firstCache,
        secondCache,
        subjectAccessStore,
        subjectAccessBarrier,
        firstFactsPublisher: createSubjectFactsRedisPublisher(firstRedis, { keyPrefix }),
        secondFactsPublisher: createSubjectFactsRedisPublisher(secondRedis, { keyPrefix }),
        subjectAccessBootstrap: createSubjectAccessBootstrap({
          redis: firstRedis,
          random: { uuid: randomUUID },
          keyPrefix: subjectAccessKeyPrefix,
        }),
        factsInspector: createSubjectFactsRedisInspector(observerRedis, { keyPrefix }),
        projectionRedis: {
          keyPrefix,
          publisher: firstRedis,
          inspector: observerRedis,
        },
        async readPublishedUserDocumentRecord(subjectIdentifier) {
          const stored = await observerRedis.get(`${keyPrefix}${subjectIdentifier}`);
          return stored === null ? null : DocumentFactsCacheRecordSchema.parse(JSON.parse(stored));
        },
        async clearPublishedUserDocumentRecord(subjectIdentifier) {
          await observerRedis.del(`${keyPrefix}${subjectIdentifier}`);
        },
        async expirePublishedUserDocumentRecord(subjectIdentifier, ttlMs) {
          const changed = await observerRedis.pexpire(`${keyPrefix}${subjectIdentifier}`, ttlMs);
          if (changed !== 1) throw new Error("Published record must exist before assigning an expiry");
        },
        async readPublishedUserDocumentTtl(subjectIdentifier) {
          return await observerRedis.pttl(`${keyPrefix}${subjectIdentifier}`);
        },
        close,
      };
    },
    async reset() {
      const control = createRedisClient(redisUrl);
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        registerCleanup(() => closeRedisClient(control));
        await resetExclusiveRedisTestDatabase({
          redis: {
            async flushdb() {
              await connectRedis(control);
              return await control.flushdb();
            },
          },
          stopExecutors: scopeClosers,
        });
      });
      scopeClosers.length = 0;
    },
    async close() {
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        for (const close of scopeClosers) registerCleanup(close);
      });
      scopeClosers.length = 0;
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

async function closeRedisClient(redis: Redis) {
  const ended = redis.status === "end" ? Promise.resolve() : new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status !== "end" && redis.status !== "wait") await redis.quit();
  } finally {
    redis.disconnect();
    await ended;
  }
}
