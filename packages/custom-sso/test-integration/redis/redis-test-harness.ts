import type { AuthorizationGrantRedemption } from "../../src/grant";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";
import Redis from "ioredis";
import { createAuthorizationGrantRedemption, createRedisAuthorizationGrantRedemptionStore } from "../../src/grant";

const TEST_REDIS_URL_ENV = "IAM_CUSTOM_SSO_TEST_REDIS_URL";
export interface AuthorizationGrantRedisTestScope {
  readonly redisNow: () => Promise<number>;
  readonly writer: AuthorizationGrantRedemption;
  readonly observer: AuthorizationGrantRedemption;
  readonly close: () => Promise<void>;
}

export async function createRedisTestHarness() {
  const redisUrl = requireDedicatedRedisTestUrl();
  const cleanupRedis = createRedisClient(redisUrl);
  let kernelHarness: Awaited<ReturnType<typeof createSessionKernelRedisTestHarness>>;

  try {
    await connectRedis(cleanupRedis);
    kernelHarness = await createSessionKernelRedisTestHarness(redisUrl);
  }
  catch (error) {
    cleanupRedis.disconnect();
    throw error;
  }

  return {
    createSessionKernelScope: kernelHarness.createSessionKernelScope,
    async createAuthorizationGrantScope(input: {
      leaseDurationMs: number;
      observerAttemptIds: readonly string[];
      writerAttemptIds: readonly string[];
    }) {
      const keyPrefix = `iam:test:authorization-grant:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(writerRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        writerRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      const writer = createAuthorizationGrantClient({
        attemptIds: input.writerAttemptIds,
        keyPrefix,
        leaseDurationMs: input.leaseDurationMs,
        redis: writerRedis,
      });
      const observer = createAuthorizationGrantClient({
        attemptIds: input.observerAttemptIds,
        keyPrefix,
        leaseDurationMs: input.leaseDurationMs,
        redis: observerRedis,
      });
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close Authorization Grant Redis test scope",
        keyPrefix,
      });

      return {
        async redisNow() {
          const [seconds, micros] = await observerRedis.time();
          return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
        },
        close,
        observer,
        writer,
      };
    },
    async close() {
      await Promise.all([cleanupRedis.quit(), kernelHarness.close()]);
    },
  };
}

function createRedisTestScopeCloser(input: {
  cleanupRedis: Redis;
  clients: readonly Redis[];
  errorMessage: string;
  keyPrefix: string;
}) {
  let closed = false;
  return async function close() {
    if (closed)
      return;
    closed = true;

    const errors: unknown[] = [];
    const closeResults = await Promise.allSettled(
      input.clients.map(client => client.quit()),
    );
    for (const result of closeResults) {
      if (result.status === "rejected")
        errors.push(result.reason);
    }

    try {
      await deleteOwnedKeys(input.cleanupRedis, input.keyPrefix);
    }
    catch (error) {
      errors.push(error);
    }

    if (errors.length > 0)
      throw new AggregateError(errors, input.errorMessage);
  };
}

function createAuthorizationGrantClient(input: {
  attemptIds: readonly string[];
  keyPrefix: string;
  leaseDurationMs: number;
  redis: Redis;
}) {
  let attemptIndex = 0;
  return createAuthorizationGrantRedemption({
    leaseDurationMs: input.leaseDurationMs,
    random: {
      uuid() {
        const attemptId = input.attemptIds[attemptIndex];
        if (attemptId === undefined)
          throw new Error("Authorization Grant Redis test attempt ID fixture exhausted");
        attemptIndex += 1;
        return attemptId;
      },
    },
    store: createRedisAuthorizationGrantRedemptionStore({
      keyPrefix: input.keyPrefix,
      redis: input.redis,
    }),
  });
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

export async function waitForRedisCondition(observe: () => Promise<boolean>, message: string) {
  const deadline = performance.now() + 4_000;
  while (performance.now() < deadline) {
    if (await observe())
      return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

export type RedisTestHarness = Awaited<ReturnType<typeof createRedisTestHarness>>;
