import type { AfterCommitLoggerPort } from "@iam/api-core/uow";
import { createImmediateUnitOfWork as createImmediateUnitOfWorkBase } from "@iam/api-core/uow";
import { mock } from "bun:test";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => Promise<unknown> | unknown;

type SortedSetMember = {
  member: string;
  score: number;
};

interface MemoryRedisPipeline {
  set: (key: string, value: unknown, ...args: Array<number | string>) => MemoryRedisPipeline;
  del: (...keys: string[]) => MemoryRedisPipeline;
  incr: (key: string) => MemoryRedisPipeline;
  expire: (key: string, seconds: number) => MemoryRedisPipeline;
  sadd: (key: string, ...members: string[]) => MemoryRedisPipeline;
  scard: (key: string) => MemoryRedisPipeline;
  zremrangebyscore: (key: string, min: number | string, max: number | string) => MemoryRedisPipeline;
  zadd: (key: string, score: number, member: string) => MemoryRedisPipeline;
  zcard: (key: string) => MemoryRedisPipeline;
  exec: () => Promise<RedisResult[]>;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function numericBoundary(value: number | string) {
  if (value === "-inf")
    return Number.NEGATIVE_INFINITY;
  if (value === "+inf" || value === "inf")
    return Number.POSITIVE_INFINITY;
  return Number(value);
}

function readExpirationMs(args: Array<number | string>, now: number) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if ((arg === "EX" || arg === "PX") && value !== undefined) {
      const duration = Number(value);
      return now + (arg === "EX" ? duration * 1000 : duration);
    }
  }
  return null;
}

export function createMemoryRedis(now: () => number = Date.now) {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const sortedSets = new Map<string, SortedSetMember[]>();
  const expires = new Map<string, number>();

  function cleanupExpired(key: string) {
    const expiresAt = expires.get(key);
    if (expiresAt === undefined || expiresAt > now())
      return;

    values.delete(key);
    sets.delete(key);
    sortedSets.delete(key);
    expires.delete(key);
  }

  function hasKey(key: string) {
    cleanupExpired(key);
    return values.has(key) || sets.has(key) || sortedSets.has(key);
  }

  const redis = {
    __values: values,
    __sets: sets,
    __sortedSets: sortedSets,
    __expires: expires,

    async get(key: string) {
      cleanupExpired(key);
      return values.get(key) ?? null;
    },

    async getdel(key: string) {
      const value = await redis.get(key);
      await redis.del(key);
      return value;
    },

    async set(key: string, value: unknown, ...args: Array<number | string>) {
      if (args.includes("NX") && hasKey(key))
        return null;

      values.set(key, String(value));
      sets.delete(key);
      sortedSets.delete(key);

      const expiresAt = readExpirationMs(args, now());
      if (expiresAt === null)
        expires.delete(key);
      else
        expires.set(key, expiresAt);

      return "OK";
    },

    async del(...keys: string[]) {
      let deleted = 0;
      for (const key of keys) {
        const existed = hasKey(key);
        values.delete(key);
        sets.delete(key);
        sortedSets.delete(key);
        expires.delete(key);
        if (existed)
          deleted += 1;
      }
      return deleted;
    },

    async exists(key: string) {
      return hasKey(key) ? 1 : 0;
    },

    async ttl(key: string) {
      if (!hasKey(key))
        return -2;
      const expiresAt = expires.get(key);
      if (expiresAt === undefined)
        return -1;
      return Math.max(0, Math.ceil((expiresAt - now()) / 1000));
    },

    async expire(key: string, seconds: number) {
      if (!hasKey(key))
        return 0;
      expires.set(key, now() + seconds * 1000);
      return 1;
    },

    async incr(key: string) {
      const value = Number(await redis.get(key) ?? 0) + 1;
      values.set(key, String(value));
      return value;
    },

    async sadd(key: string, ...members: string[]) {
      cleanupExpired(key);
      const set = sets.get(key) ?? new Set<string>();
      let added = 0;
      for (const member of members) {
        if (!set.has(member))
          added += 1;
        set.add(member);
      }
      sets.set(key, set);
      values.delete(key);
      sortedSets.delete(key);
      return added;
    },

    async scard(key: string) {
      cleanupExpired(key);
      return sets.get(key)?.size ?? 0;
    },

    async eval(_script: string, keyCount: number, ...args: string[]) {
      if (keyCount !== 1 && keyCount !== 2)
        throw new Error("memory redis eval supports one or two keys only");

      if (keyCount === 2) {
        const [codeKey, reservationKey] = args;
        const savedValue = await redis.get(codeKey!);
        const reservedValue = await redis.get(reservationKey!);
        if (savedValue === null || reservedValue === null || savedValue !== reservedValue)
          return 0;

        await redis.del(codeKey!, reservationKey!);
        return 1;
      }

      const [key, expectedValue] = args;

      const savedValue = await redis.get(key!);
      if (savedValue === null || savedValue !== expectedValue)
        return 0;

      await redis.del(key!);
      return 1;
    },

    multi() {
      const operations: RedisOperation[] = [];
      const pipeline: MemoryRedisPipeline = {
        set(key, value, ...args) {
          operations.push(() => redis.set(key, value, ...args));
          return pipeline;
        },

        del(...keys) {
          operations.push(() => redis.del(...keys));
          return pipeline;
        },

        incr(key) {
          operations.push(() => redis.incr(key));
          return pipeline;
        },

        expire(key, seconds) {
          operations.push(() => redis.expire(key, seconds));
          return pipeline;
        },

        sadd(key, ...members) {
          operations.push(() => redis.sadd(key, ...members));
          return pipeline;
        },

        scard(key) {
          operations.push(() => redis.scard(key));
          return pipeline;
        },

        zremrangebyscore(key, min, max) {
          operations.push(() => {
            cleanupExpired(key);
            const minScore = numericBoundary(min);
            const maxScore = numericBoundary(max);
            const existing = sortedSets.get(key) ?? [];
            const next = existing.filter(item => item.score < minScore || item.score > maxScore);
            sortedSets.set(key, next);
            return existing.length - next.length;
          });
          return pipeline;
        },

        zadd(key, score, member) {
          operations.push(() => {
            cleanupExpired(key);
            const existing = sortedSets.get(key) ?? [];
            sortedSets.set(key, [
              ...existing.filter(item => item.member !== member),
              { member, score },
            ]);
            values.delete(key);
            sets.delete(key);
            return 1;
          });
          return pipeline;
        },

        zcard(key) {
          operations.push(() => {
            cleanupExpired(key);
            return sortedSets.get(key)?.length ?? 0;
          });
          return pipeline;
        },

        async exec() {
          const results: RedisResult[] = [];
          for (const operation of operations) {
            try {
              results.push([null, await operation()]);
            }
            catch (error) {
              results.push([toError(error), null]);
            }
          }
          return results;
        },
      };
      return pipeline;
    },
  };

  return redis;
}

type FakeLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (...args: unknown[]) => FakeLogger;
};

export function createFakeLogger(): FakeLogger {
  const logger = {} as FakeLogger;
  logger.debug = mock(() => undefined);
  logger.info = mock(() => undefined);
  logger.warn = mock(() => undefined);
  logger.error = mock(() => undefined);
  logger.child = mock(() => logger);
  return logger;
}

export function createFakePasswordHasher() {
  return {
    hashPassword: mock(async (password: string) => `hashed:${password}`),
    verifyPassword: mock(async (password: string, hash: string) => hash === `hashed:${password}`),
  };
}

export function createImmediateUnitOfWork<TxPorts extends object>(
  txPorts: TxPorts,
  options: { logger?: AfterCommitLoggerPort } = {},
) {
  return createImmediateUnitOfWorkBase(txPorts, options);
}
