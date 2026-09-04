import type { Redis as RedisType } from "ioredis";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS,
  clientRuntimeSnapshotTestingKeys,
} from "@iam/api-core/client-runtime-snapshot/testing";
import { createProcessSmokeEnvironment } from "@iam/api-core/testing/process-smoke-harness";
import Redis from "ioredis";

const TEST_REDIS_URL_ENV = "IAM_WORKER_TEST_REDIS_URL";

export interface WorkerRedisTestHarness {
  readonly writer: RedisType;
  readonly observer: RedisType;
  readonly ownedClientCode: (label: string) => string;
  readonly ownedRestoreFixtureKey: (key: string) => string;
  readonly ownedSentinelKey: (label: string) => string;
  readonly inventoryRestoreOwnerKeys: () => Promise<string[]>;
  readonly commandEnvironment: (temporaryDirectory: string) => NodeJS.ProcessEnv;
  readonly close: () => Promise<void>;
}

export async function createWorkerRedisTestHarness(
  source: NodeJS.ProcessEnv = process.env,
): Promise<WorkerRedisTestHarness> {
  const redisUrl = resolveWorkerRedisTestUrl(source);
  const parsed = new URL(redisUrl);
  const writer = createRedisClient(redisUrl);
  const observer = createRedisClient(redisUrl);
  const cleanup = createRedisClient(redisUrl);
  const ownedClientCodes: string[] = [];
  const ownedRestoreFixtureKeys: string[] = [];
  const ownedSentinelKeys: string[] = [];

  try {
    await Promise.all([
      connectRedis(writer),
      connectRedis(observer),
      connectRedis(cleanup),
    ]);
  }
  catch (error) {
    writer.disconnect();
    observer.disconnect();
    cleanup.disconnect();
    throw error;
  }

  return {
    writer,
    observer,
    ownedClientCode(label) {
      const clientCode = `w68-${label}-${randomUUID()}`;
      ownedClientCodes.push(clientCode);
      return clientCode;
    },
    ownedRestoreFixtureKey(key) {
      ownedRestoreFixtureKeys.push(key);
      return key;
    },
    ownedSentinelKey(label) {
      const key = `iam:test:worker-runtime-repair:${randomUUID()}:${label}`;
      ownedSentinelKeys.push(key);
      return key;
    },
    async inventoryRestoreOwnerKeys() {
      return await inventoryClientRuntimeOwnerKeys(observer);
    },
    commandEnvironment(temporaryDirectory) {
      return createClientRuntimeMaintenanceProcessEnvironment(
        parsed,
        temporaryDirectory,
      );
    },
    async close() {
      const errors: unknown[] = [];
      const ownedKeys = [
        ...ownedClientCodes.flatMap((clientCode) => {
          const keys = clientRuntimeSnapshotTestingKeys(clientCode);
          return [keys.control, ...keys.payloads];
        }),
        ...ownedRestoreFixtureKeys,
        ...ownedSentinelKeys,
      ];
      try {
        if (ownedKeys.length > 0)
          await cleanup.unlink(...ownedKeys);
        const remainingOwnerInventory = await inventoryClientRuntimeOwnerKeys(observer);
        if (remainingOwnerInventory.length > 0) {
          throw new Error(
            `Worker Redis test left ${remainingOwnerInventory.length} Client Runtime owner key(s)`,
          );
        }
      }
      catch (error) {
        errors.push(error);
      }
      const closeResults = await Promise.allSettled([
        writer.quit(),
        observer.quit(),
        cleanup.quit(),
      ]);
      for (const result of closeResults) {
        if (result.status === "rejected")
          errors.push(result.reason);
      }
      if (errors.length > 0)
        throw new AggregateError(errors, "Failed to close Worker Redis test harness");
    },
  };
}

function createClientRuntimeMaintenanceProcessEnvironment(
  parsed: URL,
  temporaryDirectory: string,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_REDIS_HOST: parsed.hostname,
      IAM_WORKER_REDIS_PORT: parsed.port || "6379",
      IAM_WORKER_REDIS_PASSWORD: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      IAM_WORKER_REDIS_DB: parsed.pathname.length > 1
        ? decodeURIComponent(parsed.pathname.slice(1))
        : "0",
      IAM_WORKER_LOG_LEVEL: "warn",
      IAM_WORKER_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

export function resolveWorkerRedisTestUrl(source: NodeJS.ProcessEnv) {
  const redisUrl = source[TEST_REDIS_URL_ENV];
  if (!redisUrl) {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:")
    throw new Error(`${TEST_REDIS_URL_ENV} must use the redis protocol supported by the Worker runtime`);
  if (parsed.search)
    throw new Error(`${TEST_REDIS_URL_ENV} must not use query parameters`);
  if (parsed.username && decodeURIComponent(parsed.username) !== "default") {
    throw new Error(
      `${TEST_REDIS_URL_ENV} cannot use a Redis ACL username unsupported by the Worker runtime configuration`,
    );
  }
  const runtimeHost = source.IAM_WORKER_REDIS_HOST;
  const runtimePort = source.IAM_WORKER_REDIS_PORT || "6379";
  const runtimeDb = source.IAM_WORKER_REDIS_DB || "0";
  const testDb = parsed.pathname.length > 1
    ? decodeURIComponent(parsed.pathname.slice(1))
    : "0";
  if (
    runtimeHost
    && parsed.hostname.toLowerCase() === runtimeHost.toLowerCase()
    && (parsed.port || "6379") === runtimePort
    && testDb === runtimeDb
  ) {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must not identify the Worker runtime Redis resource`,
    );
  }
  return redisUrl;
}

async function inventoryClientRuntimeOwnerKeys(redis: RedisType) {
  const keys = new Set<string>();
  for (const { pattern } of CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS) {
    let cursor = "0";
    do {
      const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      for (const key of batch)
        keys.add(key);
    } while (cursor !== "0");
  }
  return [...keys].sort();
}

function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
}

async function connectRedis(redis: RedisType) {
  await redis.connect();
  await redis.ping();
}
