import type Redis from "ioredis";

export interface OwnedTestResourceLifecycle {
  readonly registerCleanup: (
    cleanup: () => Promise<void> | void,
  ) => void;
}

export interface DedicatedRedisTestConfig {
  readonly db: number;
  readonly host: string;
  readonly password?: string;
  readonly port: number;
}

export interface RedisKeyInventoryPort {
  readonly removeKeys: (keys: readonly string[]) => Promise<unknown>;
  readonly scanPage: (
    cursor: string,
  ) => Promise<[cursor: string, keys: string[]]>;
}

export function createRedisKeyInventoryPort(
  redis: Pick<Redis, "scan" | "unlink">,
): RedisKeyInventoryPort {
  return {
    async removeKeys(keys) {
      return await redis.unlink(...keys);
    },
    async scanPage(cursor) {
      return await redis.scan(cursor, "COUNT", "100");
    },
  };
}

export function requireExternalTestUrl(input: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly lane: string;
  readonly name: string;
}): string {
  const value = input.environment[input.name]?.trim();
  if (!value) {
    throw new Error(
      `${input.name} is required for ${input.lane}; provide dedicated disposable test resources`,
    );
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
    throw new Error(
      `${input.name} must use the postgres or postgresql protocol`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !databaseName
    || ["postgres", "template0", "template1"].includes(
      databaseName.toLowerCase(),
    )
  ) {
    throw new Error(
      `${input.name} must name a dedicated, non-system test database`,
    );
  }

  const identity = postgresDatabaseIdentity(parsed);
  for (const forbidden of input.forbidden) {
    if (
      forbidden.value !== undefined
      && postgresDatabaseIdentity(new URL(forbidden.value)) === identity
    ) {
      throw new Error(
        `${input.name} must not identify the same database as ${forbidden.name}`,
      );
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
  if (parsed.protocol !== "redis:")
    throw new Error(`${input.name} must use the redis protocol`);
  if (parsed.hostname.length === 0)
    throw new Error(`${input.name} must contain a Redis hostname`);

  const databasePath = parsed.pathname === "" || parsed.pathname === "/"
    ? "0"
    : parsed.pathname.slice(1);
  if (!/^\d+$/u.test(databasePath))
    throw new Error(`${input.name} must contain a valid database number`);
  const db = Number(databasePath);
  if (!Number.isSafeInteger(db))
    throw new Error(`${input.name} must contain a valid database number`);

  const port = Number(parsed.port || "6379");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new Error(`${input.name} must contain a valid Redis port`);

  return {
    db,
    host: parsed.hostname,
    password: parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined,
    port,
  };
}

export async function inventoryRedisKeys(
  redis: Pick<RedisKeyInventoryPort, "scanPage">,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const [nextCursor, page] = await redis.scanPage(cursor);
    cursor = nextCursor;
    for (const key of page)
      keys.add(key);
  } while (cursor !== "0");
  return keys;
}

export async function cleanupRedisKeysAddedSince(
  redis: RedisKeyInventoryPort,
  existingKeys: ReadonlySet<string>,
): Promise<number> {
  const currentKeys = await inventoryRedisKeys(redis);
  const addedKeys = [...currentKeys]
    .filter(key => !existingKeys.has(key))
    .sort();
  const failures: unknown[] = [];
  for (let offset = 0; offset < addedKeys.length; offset += 100) {
    try {
      await redis.removeKeys(addedKeys.slice(offset, offset + 100));
    }
    catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1)
    throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Failed to clean added Redis test keys",
    );
  }
  return addedKeys.length;
}

export async function cleanupRedisKeysMatchingOwnerMarkers(input: {
  readonly diagnosticLabel: string;
  readonly ownerMarkers: ReadonlySet<string>;
  readonly redis: RedisKeyInventoryPort;
}): Promise<void> {
  const markers = [...input.ownerMarkers];
  if (
    markers.length === 0
    || markers.some(marker => (
      typeof marker !== "string"
      || marker.length === 0
      || marker.trim() !== marker
    ))
  ) {
    throw new TypeError(
      `${input.diagnosticLabel} cleanup requires non-empty trimmed owner markers`,
    );
  }
  async function listOwnedKeys() {
    return [...await inventoryRedisKeys(input.redis)]
      .filter(key => markers.some(marker => key.includes(marker)))
      .sort();
  }

  const ownedKeys = await listOwnedKeys();
  if (ownedKeys.length > 0)
    await input.redis.removeKeys(ownedKeys);
  const remainingOwnedKeyCount = (await listOwnedKeys()).length;
  if (remainingOwnedKeyCount > 0) {
    throw new Error(
      `${input.diagnosticLabel} cleanup left ${remainingOwnedKeyCount} owned Redis keys`,
    );
  }
}

function postgresDatabaseIdentity(parsed: URL) {
  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${
    decodeURIComponent(parsed.pathname.slice(1))
  }`;
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
  }
  catch (error) {
    failures.push(error);
  }

  for (const cleanup of cleanups.toReversed()) {
    try {
      await cleanup();
    }
    catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1)
    throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Owned test resource lifecycle failed",
    );
  }

  return result as T;
}
