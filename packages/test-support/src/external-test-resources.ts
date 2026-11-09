import { type RedisConfig, redisUrlString } from "@iam/runtime/redis/config";
import Redis from "ioredis";

export interface OwnedTestResourceLifecycle {
  readonly registerCleanup: (cleanup: () => Promise<void> | void) => void;
}

export type DedicatedRedisTestConfig = Readonly<RedisConfig>;

/** 仅用于本例独占的 DB；调用方登记全部执行者，控制连接在 reset 后另行关闭。 */
export async function resetExclusiveRedisTestDatabase(input: {
  readonly redis: Pick<Redis, "flushdb">;
  readonly stopExecutors: ReadonlyArray<() => Promise<void> | void>;
}): Promise<void> {
  const failures: unknown[] = [];
  for (const stop of input.stopExecutors.toReversed()) {
    try {
      await stop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0)
    throw new AggregateError(failures, "Exclusive Redis executors failed to stop; database was not reset");
  await input.redis.flushdb();
}

export function requireExternalTestUrl(input: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly lane: string;
  readonly name: string;
}): string {
  const value = input.environment[input.name]?.trim();
  if (!value) {
    throw new Error(`${input.name} is required for ${input.lane}; provide dedicated disposable test resources`);
  }
  return value;
}

export function requireDedicatedPostgresTestUrl(input: {
  readonly forbidden: ReadonlyArray<{
    readonly name: string;
    readonly value: string | undefined;
  }>;
  readonly name: string;
  readonly value: string;
}): string {
  const parsed = new URL(input.value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${input.name} must use the postgres or postgresql protocol`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || ["postgres", "template0", "template1"].includes(databaseName.toLowerCase())) {
    throw new Error(`${input.name} must name a dedicated, non-system test database`);
  }

  const identity = postgresDatabaseIdentity(parsed);
  for (const forbidden of input.forbidden) {
    if (forbidden.value !== undefined && postgresDatabaseIdentity(new URL(forbidden.value)) === identity) {
      throw new Error(`${input.name} must not identify the same database as ${forbidden.name}`);
    }
  }
  return input.value;
}

export function parseDedicatedRedisTestUrl(input: {
  readonly name: string;
  readonly value: string;
}): DedicatedRedisTestConfig {
  const parsed = redisUrlString().safeParse(input.value);
  if (!parsed.success) throw new Error(`${input.name} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

function postgresDatabaseIdentity(parsed: URL) {
  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${decodeURIComponent(parsed.pathname.slice(1))}`;
}

export async function runWithOwnedTestResources<T>(
  body: (lifecycle: OwnedTestResourceLifecycle) => Promise<T>,
): Promise<T> {
  const cleanups: Array<() => Promise<void> | void> = [];
  const failures: unknown[] = [];
  let result: T | undefined;

  try {
    result = await body({
      registerCleanup(cleanup) {
        cleanups.push(cleanup);
      },
    });
  } catch (error) {
    failures.push(error);
  }

  for (const cleanup of cleanups.toReversed()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Owned test resource lifecycle failed");
  }

  return result as T;
}

/** 提供给直接使用 ioredis URL 的专用测试；生产配置消费者使用 parseDedicatedRedisTestUrl。 */
export function createExclusiveRedisTestHarness(input: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly name: string;
}) {
  const url = input.environment[input.name];
  if (!url) {
    throw new Error(
      `${input.name} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${input.name} must use the redis or rediss protocol`);

  const scopeClosers: Array<() => Promise<void>> = [];

  return {
    url,
    async openPair() {
      const first = createRedisClient(url);
      const second = createRedisClient(url);
      const close = createRedisTestScopeCloser({ clients: [first, second] });
      scopeClosers.push(close);
      try {
        await Promise.all([connectRedis(first), connectRedis(second)]);
      } catch (error) {
        await runWithOwnedTestResources(async ({ registerCleanup }) => {
          registerCleanup(close);
          throw error;
        });
      }
      return { first, second, close };
    },
    async reset(stopExecutors: ReadonlyArray<() => Promise<void> | void> = []) {
      const control = createRedisClient(url);
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

async function closeRedisClient(redis: Redis) {
  const ended = redis.status === "end" ? Promise.resolve() : new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status !== "end" && redis.status !== "wait") await redis.quit();
  } finally {
    redis.disconnect();
    await ended;
  }
}
