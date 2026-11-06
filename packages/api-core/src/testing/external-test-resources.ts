import type Redis from "ioredis";
import { type RedisConfig, redisUrlString } from "../redis/config";

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
