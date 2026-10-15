import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { LoginRestriction } from "../../src/login-restriction";
import { createLoginRestriction, createRedisLoginRestrictionStore } from "../../src/login-restriction";
import type { SubjectAccessBarrier, SubjectAccessBootstrap } from "../../src/subject-access";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
} from "../../src/subject-access";
import type { SubjectAccessAtomicStore } from "../../src/subject-access/storage/store";
import { resetExclusiveRedisTestDatabase, runWithOwnedTestResources } from "../../src/testing/external-test-resources";

const TEST_REDIS_URL_ENV = "IAM_API_CORE_TEST_REDIS_URL";
const OBSERVER_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export interface RedisTestScope {
  readonly writer: LoginRestriction;
  readonly observer: LoginRestriction;
  readonly close: () => Promise<void>;
}

export interface RedisTestHarness {
  readonly reset: (stopExecutors?: ReadonlyArray<() => Promise<void> | void>) => Promise<void>;
  readonly createScope: () => Promise<RedisTestScope>;
  readonly createSubjectAccessScope: (input: {
    writerTransitionIds: readonly string[];
    observerTransitionIds: readonly string[];
  }) => Promise<SubjectAccessRedisTestScope>;
  readonly close: () => Promise<void>;
}

export interface SubjectAccessRedisTestScope {
  readonly bootstrap: SubjectAccessBootstrap;
  readonly writer: SubjectAccessBarrier;
  readonly observer: SubjectAccessBarrier;
  readonly writerBacklog: Pick<
    SubjectAccessAtomicStore,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly observerBacklog: Pick<
    SubjectAccessAtomicStore,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly seedRepairIndex: (subjectIdentifiers: readonly string[], score?: number) => Promise<void>;
  readonly seedRepairAgeIndex: (subjectIdentifiers: readonly string[], score?: number) => Promise<void>;
  readonly removeRepairAgeEntry: (subjectIdentifier: string) => Promise<void>;
  readonly seedRecord: (subjectIdentifier: string, serializedRecord: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createRedisTestHarness(): Promise<RedisTestHarness> {
  const redisUrl = requireDedicatedRedisTestUrl();
  const scopeClosers: Array<() => Promise<void>> = [];

  return {
    async createScope() {
      const keyPrefix = `iam:test:login-restriction:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);
      const close = createRedisTestScopeCloser({
        clients: [writerRedis, observerRedis],
      });
      scopeClosers.push(close);

      try {
        await Promise.all([connectRedis(writerRedis), connectRedis(observerRedis)]);
      } catch (error) {
        return await runWithOwnedTestResources<RedisTestScope>(async ({ registerCleanup }) => {
          registerCleanup(close);
          throw error;
        });
      }

      const writer = createLoginRestrictionClient({
        clock: { now: Date.now },
        keyPrefix,
        redis: writerRedis,
      });
      const observer = createLoginRestrictionClient({
        clock: { now: () => Date.now() - OBSERVER_CLOCK_SKEW_MS },
        keyPrefix,
        redis: observerRedis,
      });
      return {
        close,
        observer,
        writer,
      };
    },
    async createSubjectAccessScope(input) {
      const keyPrefix = `iam:test:subject-access:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);
      const close = createRedisTestScopeCloser({
        clients: [writerRedis, observerRedis],
      });
      scopeClosers.push(close);

      try {
        await Promise.all([connectRedis(writerRedis), connectRedis(observerRedis)]);
      } catch (error) {
        return await runWithOwnedTestResources<SubjectAccessRedisTestScope>(async ({ registerCleanup }) => {
          registerCleanup(close);
          throw error;
        });
      }

      const writerClient = createSubjectAccessClient({
        keyPrefix,
        redis: writerRedis,
        transitionIds: input.writerTransitionIds,
      });
      const observerClient = createSubjectAccessClient({
        keyPrefix,
        redis: observerRedis,
        transitionIds: input.observerTransitionIds,
      });
      return {
        bootstrap: createSubjectAccessBootstrap({
          keyPrefix,
          random: { uuid: randomUUID },
          redis: writerRedis,
        }),
        close,
        observer: observerClient.barrier,
        observerBacklog: observerClient.backlog,
        async seedRepairIndex(subjectIdentifiers, score = 0) {
          if (subjectIdentifiers.length === 0) return;
          await writerRedis.zadd(
            `${keyPrefix}idx:repair`,
            ...subjectIdentifiers.flatMap((subject) => [score, subject]),
          );
        },
        async seedRepairAgeIndex(subjectIdentifiers, score = 0) {
          if (subjectIdentifiers.length === 0) return;
          await writerRedis.zadd(
            `${keyPrefix}idx:repair:age`,
            ...subjectIdentifiers.flatMap((subject) => [score, subject]),
          );
        },
        async removeRepairAgeEntry(subjectIdentifier) {
          await writerRedis.zrem(`${keyPrefix}idx:repair:age`, subjectIdentifier);
        },
        async seedRecord(subjectIdentifier, serializedRecord) {
          await writerRedis.set(`${keyPrefix}record:${subjectIdentifier}`, serializedRecord);
        },
        writer: writerClient.barrier,
        writerBacklog: writerClient.backlog,
      };
    },
    async reset(stopExecutors = []) {
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
          stopExecutors: [...scopeClosers, ...stopExecutors],
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

export function createRedisTestScopeCloser(input: { clients: readonly Redis[] }) {
  let closePromise: Promise<void> | undefined;
  return function close() {
    closePromise ??= runWithOwnedTestResources(async ({ registerCleanup }) => {
      for (const client of input.clients) registerCleanup(() => closeRedisClient(client));
    });
    return closePromise;
  };
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

function createSubjectAccessClient(input: { keyPrefix: string; redis: Redis; transitionIds: readonly string[] }) {
  let transitionIdIndex = 0;
  const backlog = createRedisSubjectAccessStore({
    keyPrefix: input.keyPrefix,
    redis: input.redis,
  });
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: {
      uuid() {
        const transitionId = input.transitionIds[transitionIdIndex];
        if (transitionId === undefined) throw new Error("Subject Access Redis test transition ID fixture exhausted");
        transitionIdIndex += 1;
        return transitionId;
      },
    },
    store: backlog,
  });
  return { backlog, barrier };
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

function createLoginRestrictionClient(input: {
  clock: {
    now: () => number;
  };
  keyPrefix: string;
  redis: Redis;
}) {
  return createLoginRestriction({
    clock: input.clock,
    random: { uuid: randomUUID },
    store: createRedisLoginRestrictionStore({
      keyPrefix: input.keyPrefix,
      redis: input.redis,
    }),
  });
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

export async function waitForRedisCondition(observe: () => Promise<boolean>, message: string) {
  const deadline = performance.now() + 4_000;
  while (performance.now() < deadline) {
    if (await observe()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}
