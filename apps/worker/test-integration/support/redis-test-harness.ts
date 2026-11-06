import { randomUUID } from "node:crypto";
import process from "node:process";
import { redisUrlString } from "@iam/api-core/redis/config";
import {
  parseDedicatedRedisTestUrl,
  resetExclusiveRedisTestDatabase,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import { createProcessSmokeEnvironment } from "@iam/api-core/testing/process-smoke-harness";
import type { Redis as RedisType } from "ioredis";
import Redis from "ioredis";

const TEST_REDIS_URL_ENV = "IAM_WORKER_TEST_REDIS_URL";

export interface WorkerRedisTestHarness {
  readonly writer: RedisType;
  readonly observer: RedisType;
  readonly seedNonOwnerSentinels: (prefixes: readonly string[]) => Promise<string[]>;
  readonly commandEnvironment: (temporaryDirectory: string) => NodeJS.ProcessEnv;
  readonly close: () => Promise<void>;
}

export async function createWorkerRedisTestHarness(
  source: NodeJS.ProcessEnv = process.env,
): Promise<WorkerRedisTestHarness> {
  const redisUrl = resolveWorkerRedisTestUrl(source);
  const writer = createRedisClient(redisUrl);
  const observer = createRedisClient(redisUrl);
  let closePromise: Promise<void> | undefined;

  function close() {
    closePromise ??= runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(() => closeRedisClient(writer));
      lifecycle.registerCleanup(() => closeRedisClient(observer));
    });
    return closePromise;
  }

  try {
    await Promise.all([connectRedis(writer), connectRedis(observer)]);
  } catch (error) {
    return await runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(close);
      throw error;
    });
  }

  return {
    writer,
    observer,
    async seedNonOwnerSentinels(prefixes) {
      // Deliberately opaque resource sentinels, not serialized records of another production owner.
      const keys: string[] = [];
      for (const prefix of prefixes) {
        const key = `${prefix}${randomUUID()}`;
        keys.push(key);
        await writer.set(key, "sensitive-fixture", "PX", 120000);
      }
      return keys;
    },
    commandEnvironment(temporaryDirectory) {
      return createClientRuntimeMaintenanceProcessEnvironment(redisUrl, temporaryDirectory);
    },
    close,
  };
}

export async function resetWorkerRedisTestDatabase(stopExecutors: ReadonlyArray<() => Promise<void> | void>) {
  let control: RedisType | undefined;
  await runWithOwnedTestResources(async (lifecycle) => {
    lifecycle.registerCleanup(() => (control ? closeRedisClient(control) : undefined));
    await resetExclusiveRedisTestDatabase({
      redis: {
        async flushdb() {
          // Create only after all executors stopped, so even a failed control connection
          // leaves the caller's resources stopped and the original failure observable.
          control = createRedisClient(resolveWorkerRedisTestUrl(process.env));
          await connectRedis(control);
          return await control.flushdb();
        },
      },
      stopExecutors,
    });
  });
}

function createClientRuntimeMaintenanceProcessEnvironment(redisUrl: string, temporaryDirectory: string) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_REDIS_URL: redisUrl,
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
  const test = parseDedicatedRedisTestUrl({ name: TEST_REDIS_URL_ENV, value: redisUrl });
  const runtimeUrl = source.IAM_WORKER_REDIS_URL;
  if (runtimeUrl) {
    const runtime = redisUrlString().parse(runtimeUrl);
    if (
      test.host.toLowerCase() === runtime.host.toLowerCase() &&
      test.port === runtime.port &&
      test.db === runtime.db
    ) {
      throw new Error(`${TEST_REDIS_URL_ENV} must not identify the Worker runtime Redis resource`);
    }
  }
  return redisUrl;
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

async function closeRedisClient(redis: RedisType) {
  try {
    if (redis.status === "ready") await redis.quit();
  } finally {
    redis.disconnect();
  }
}
