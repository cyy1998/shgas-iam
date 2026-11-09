import { randomUUID } from "node:crypto";
import type { LoginRestriction } from "@iam/login-restriction";
import { createLoginRestriction, LOGIN_FAILURE_WINDOW_SECONDS } from "@iam/login-restriction";
import { createRedisLoginRestrictionStore } from "@iam/login-restriction/redis";
import type { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import type Redis from "ioredis";

const OBSERVER_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export interface LoginRestrictionRedisTestScope {
  readonly writer: LoginRestriction;
  readonly observer: LoginRestriction;
  readonly seedFailureHistory: (userId: number, agesMilliseconds: readonly number[]) => Promise<void>;
  readonly setRestrictionExpiries: (
    expirations: readonly { userId: number; remainingMilliseconds: number }[],
  ) => Promise<void>;
  readonly seedRestrictionIndex: (userId: number, remainingMilliseconds: number) => Promise<void>;
  readonly removeRestrictionIndex: (userId: number) => Promise<void>;
  readonly inspectLoginState: (userId: number) => Promise<{
    failureCount: number;
    restrictionTtl: number;
    indexedUntil: string | null;
  }>;
}

export async function createLoginRestrictionRedisTestScope(
  harness: ReturnType<typeof createExclusiveRedisTestHarness>,
): Promise<LoginRestrictionRedisTestScope> {
  const keyPrefix = `iam:test:login-restriction:${randomUUID()}:`;
  const { first: writerRedis, second: observerRedis } = await harness.openPair();

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
    observer,
    writer,
    async seedFailureHistory(userId, agesMilliseconds) {
      const now = await redisNow(writerRedis);
      const key = `${keyPrefix}login-failures:user:${userId}`;
      await writerRedis.zadd(key, ...agesMilliseconds.flatMap((age, index) => [now - age, `seed-${index}`]));
      await writerRedis.expire(key, LOGIN_FAILURE_WINDOW_SECONDS);
    },
    async setRestrictionExpiries(expirations) {
      const now = await redisNow(writerRedis);
      for (const { userId, remainingMilliseconds } of expirations) {
        const deadline = now + remainingMilliseconds;
        await writerRedis.pexpireat(`${keyPrefix}login-blacklist:user:${userId}`, deadline);
        await writerRedis.zadd(`${keyPrefix}login-blacklist:idx:users`, deadline, String(userId));
      }
    },
    async seedRestrictionIndex(userId, remainingMilliseconds) {
      await writerRedis.zadd(
        `${keyPrefix}login-blacklist:idx:users`,
        (await redisNow(writerRedis)) + remainingMilliseconds,
        String(userId),
      );
    },
    async removeRestrictionIndex(userId) {
      await writerRedis.zrem(`${keyPrefix}login-blacklist:idx:users`, String(userId));
    },
    async inspectLoginState(userId) {
      const [failureCount, restrictionTtl, indexedUntil] = await Promise.all([
        writerRedis.zcard(`${keyPrefix}login-failures:user:${userId}`),
        writerRedis.pttl(`${keyPrefix}login-blacklist:user:${userId}`),
        writerRedis.zscore(`${keyPrefix}login-blacklist:idx:users`, String(userId)),
      ]);
      return { failureCount, restrictionTtl, indexedUntil };
    },
  };
}

async function redisNow(redis: Redis) {
  const [seconds, microseconds] = await redis.time();
  return Number(seconds) * 1_000 + Math.floor(Number(microseconds) / 1_000);
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

export async function waitForRedisCondition(observe: () => Promise<boolean>, message: string) {
  const deadline = performance.now() + 4_000;
  while (performance.now() < deadline) {
    if (await observe()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}
