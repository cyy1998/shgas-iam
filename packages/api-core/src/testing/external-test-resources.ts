import type Redis from "ioredis";

export interface OwnedTestResourceLifecycle {
  readonly registerCleanup: (cleanup: () => Promise<void> | void) => void;
}

export interface DedicatedRedisTestConfig {
  readonly db: number;
  readonly host: string;
  readonly password?: string;
  readonly port: number;
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
  const parsed = new URL(input.value);
  if (parsed.protocol === "rediss:") {
    throw new Error(
      `${input.name} does not support rediss because the production Redis configuration has no TLS settings; use redis with a dedicated test resource`,
    );
  }
  if (parsed.protocol !== "redis:") throw new Error(`${input.name} must use the redis protocol`);
  if (parsed.hostname.length === 0) throw new Error(`${input.name} must contain a Redis hostname`);

  const databasePath = parsed.pathname === "" || parsed.pathname === "/" ? "0" : parsed.pathname.slice(1);
  if (!/^\d+$/u.test(databasePath)) throw new Error(`${input.name} must contain a valid database number`);
  const db = Number(databasePath);
  if (!Number.isSafeInteger(db)) throw new Error(`${input.name} must contain a valid database number`);

  const port = Number(parsed.port || "6379");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new Error(`${input.name} must contain a valid Redis port`);

  return {
    db,
    host: parsed.hostname,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    port,
  };
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
