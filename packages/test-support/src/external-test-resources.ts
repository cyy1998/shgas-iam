import { randomUUID } from "node:crypto";
import { type RedisConfig, redisUrlString } from "@iam/runtime/redis/config";
import Redis from "ioredis";

export { requireDedicatedPostgresTestUrl, TEST_POSTGRES_URL_ENV } from "./dedicated-postgres-test-url";

export const TEST_REDIS_URL_ENV = "IAM_TEST_REDIS_URL";

export interface OwnedTestResourceLifecycle {
  readonly registerCleanup: (cleanup: () => Promise<void> | void) => void;
}

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

export function parseDedicatedRedisTestUrl(input: {
  readonly name: string;
  readonly value: string;
}): Readonly<RedisConfig> {
  const parsed = redisUrlString().safeParse(input.value);
  if (!parsed.success) throw new Error(`${input.name} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
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

export function requireDedicatedRedisTestUrl({
  environment = process.env,
  name = TEST_REDIS_URL_ENV,
}: {
  environment?: Readonly<Record<string, string | undefined>>;
  name?: string;
} = {}) {
  const value = requireExternalTestUrl({ environment, name, lane: "Redis Integration" });
  const selected = parseDedicatedRedisTestUrl({ name, value });
  const normalizeHost = (host: string) => {
    host = host.toLowerCase();
    return host === "localhost" || host === "::1" ? "127.0.0.1" : host;
  };
  for (const [runtimeName, runtimeUrl] of Object.entries(environment)) {
    if (
      !runtimeUrl ||
      runtimeName === name ||
      !/^(?:REDIS_URL|IAM_(?!TEST_)(?:[A-Z_0-9]+_)?REDIS_URL)$/u.test(runtimeName)
    )
      continue;
    const runtime = parseDedicatedRedisTestUrl({ name: runtimeName, value: runtimeUrl });
    if (
      normalizeHost(selected.host) === normalizeHost(runtime.host) &&
      selected.port === runtime.port &&
      selected.db === runtime.db
    )
      throw new Error(`${name} must not identify the same Redis database as ${runtimeName}`);
  }
  return value;
}

type StopExecutor = () => unknown | Promise<unknown>;

export async function resetRedisTestDatabase(
  stopExecutors: ReadonlyArray<() => Promise<void> | void>,
  resolveUrl: () => string = requireDedicatedRedisTestUrl,
) {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    await resetExclusiveRedisTestDatabase({
      stopExecutors,
      redis: {
        async flushdb() {
          const control = createRedisClient(resolveUrl());
          registerCleanup(() => closeRedisTestClient(control));
          await connectRedis(control);
          return await control.flushdb();
        },
      },
    });
  });
}

export function createOwnedRedisTestLifecycle(resolveUrl: () => string = requireDedicatedRedisTestUrl) {
  const stops: Array<() => Promise<void>> = [];
  return {
    registerStopExecutor(stop: StopExecutor) {
      let closing: Promise<void> | undefined;
      const close = () =>
        (closing ??= Promise.resolve().then(async () => {
          await stop();
        }));
      stops.push(close);
      return close;
    },
    async reset(onlyIfUsed = false) {
      if (onlyIfUsed && !stops.length) return;
      await resetRedisTestDatabase(stops, resolveUrl);
      stops.length = 0;
    },
    async close() {
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        for (const stop of stops) registerCleanup(stop);
      });
      stops.length = 0;
    },
  };
}

export function createExclusiveRedisTestHarness(input: Parameters<typeof requireDedicatedRedisTestUrl>[0] = {}) {
  const url = requireDedicatedRedisTestUrl(input);
  const lifecycle = createOwnedRedisTestLifecycle(() => url);
  async function openScope<Role extends string>(label: string, roles: readonly Role[]) {
    const entries = roles.map((role) => [role, createRedisClient(url)] as const);
    const clients = Object.fromEntries(entries) as Record<Role, Redis>;
    const scopeClients = entries.map(([, client]) => client);
    const close = lifecycle.registerStopExecutor(createRedisTestScopeCloser({ clients: scopeClients }));
    const results = await Promise.allSettled(scopeClients.map(connectRedis));
    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (failures.length > 0) {
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        registerCleanup(close);
        throw new AggregateError(failures, "Redis test scope setup failed");
      });
    }
    const scopeId = randomUUID();
    const clientId = `${label}-${scopeId.replaceAll("-", "")}`;
    let sequence = 0;
    return {
      clients,
      close,
      keyPrefix: `iam:test:${label}:${scopeId}:`,
      clientCode: (suffix: string) => `${clientId}-${suffix}-${++sequence}`,
    };
  }

  return {
    ...lifecycle,
    url,
    openScope,
    async openPair() {
      const { clients, close } = await openScope("redis", ["first", "second"]);
      return { ...clients, close };
    },
    reset: async (stops: ReadonlyArray<() => Promise<void> | void> = []) => {
      for (const stop of stops) lifecycle.registerStopExecutor(stop);
      await lifecycle.reset();
    },
  };
}

export async function seedRedisTestSentinels(writer: Redis, prefixes: readonly string[]) {
  const keys: string[] = [];
  for (const prefix of prefixes) {
    const key = `${prefix}${randomUUID()}`;
    await writer.set(key, "sensitive-fixture", "PX", 120_000);
    keys.push(key);
  }
  return keys;
}

export function createRedisTestScopeCloser(input: { clients: readonly Redis[] }) {
  let closePromise: Promise<void> | undefined;
  return function close() {
    closePromise ??= runWithOwnedTestResources(async ({ registerCleanup }) => {
      for (const client of input.clients) registerCleanup(() => closeRedisTestClient(client));
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
    retryStrategy: () => null,
  });
}

async function connectRedis(redis: Redis) {
  await redis.connect();
  await redis.ping();
}

export async function closeRedisTestClient(redis: Redis) {
  const { status } = redis;
  if (status === "end") return;
  if (status === "wait" || status === "reconnecting") {
    // ioredis 6 cancels its reconnect timer without emitting "end".
    redis.disconnect();
    return;
  }
  const ended = new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status === "ready") await redis.quit();
  } finally {
    redis.disconnect();
    if (redis.status !== "reconnecting" && redis.status !== "end") await ended;
  }
}
