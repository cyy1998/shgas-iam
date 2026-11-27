import { randomUUID } from "node:crypto";
import { createSubjectAccessBarrier } from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import type { DocumentFactsCacheRecord } from "../../../src/user/subject-facts";
import {
  createSubjectFactsRedisCache,
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
  DocumentFactsCacheRecordSchema,
} from "../../../src/user/subject-facts";
import type {
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "../../../src/user/subject-facts/subject-facts-redis-publisher.core";

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
  const harness = createExclusiveRedisTestHarness();

  return {
    reset: harness.reset,
    close: harness.close,
    async createScope() {
      const {
        clients: { firstRedis, secondRedis, observerRedis },
        close,
        keyPrefix,
      } = await harness.openScope("user-document:subject-facts", ["firstRedis", "secondRedis", "observerRedis"]);
      const subjectAccessKeyPrefix = `iam:test:user-document:subject-access:${randomUUID()}:`;
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
  };
}
