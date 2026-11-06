import { randomUUID } from "node:crypto";
import process from "node:process";
import { redisUrlString } from "@iam/api-core/redis/config";
import {
  resetExclusiveRedisTestDatabase,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import { createProcessSmokeEnvironment } from "@iam/api-core/testing/process-smoke-harness";
import type { Redis as RedisType } from "ioredis";
import Redis from "ioredis";

const TEST_REDIS_URL_ENV = "IAM_OPS_TEST_REDIS_URL";

export interface OpsRedisTestHarness {
  readonly writer: RedisType;
  readonly observer: RedisType;
  readonly seedNonOwnerSentinels: (prefixes: readonly string[]) => Promise<string[]>;
  readonly commandEnvironment: (temporaryDirectory: string) => NodeJS.ProcessEnv;
  readonly close: () => Promise<void>;
}

export async function createOpsRedisTestHarness(source: NodeJS.ProcessEnv = process.env): Promise<OpsRedisTestHarness> {
  const redisUrl = resolveOpsRedisTestUrl(source);
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

export async function resetOpsRedisTestDatabase(stopExecutors: ReadonlyArray<() => Promise<void> | void>) {
  let control: RedisType | undefined;
  await runWithOwnedTestResources(async (lifecycle) => {
    lifecycle.registerCleanup(() => (control ? closeRedisClient(control) : undefined));
    await resetExclusiveRedisTestDatabase({
      redis: {
        async flushdb() {
          // Create only after all executors stopped, so even a failed control connection
          // leaves the caller's resources stopped and the original failure observable.
          control = createRedisClient(resolveOpsRedisTestUrl(process.env));
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
      IAM_OPS_REDIS_URL: redisUrl,
      IAM_OPS_LOG_LEVEL: "warn",
      IAM_OPS_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

export function resolveOpsRedisTestUrl(source: NodeJS.ProcessEnv) {
  const redisUrl = source[TEST_REDIS_URL_ENV];
  if (!redisUrl) {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }
  const test = redisUrlString().safeParse(redisUrl);
  if (!test.success)
    throw new Error(`${TEST_REDIS_URL_ENV} must contain a valid Redis URL supported by the Ops runtime`);
  if (source.IAM_OPS_REDIS_URL !== undefined) {
    const runtime = redisUrlString().safeParse(source.IAM_OPS_REDIS_URL);
    if (!runtime.success) throw new Error("IAM_OPS_REDIS_URL must contain a valid Ops runtime Redis URL");
    if (
      test.data.host.toLowerCase() === runtime.data.host.toLowerCase() &&
      test.data.port === runtime.data.port &&
      test.data.db === runtime.data.db
    ) {
      throw new Error(`${TEST_REDIS_URL_ENV} must not identify the Ops runtime Redis resource`);
    }
  }
  return redisUrl;
}

export function overrideOpsRedisTestUrl(overrides: { port?: number; username?: string; password?: string }) {
  const url = new URL(resolveOpsRedisTestUrl(process.env));
  if (overrides.port !== undefined) url.port = String(overrides.port);
  if (overrides.username !== undefined) url.username = encodeURIComponent(overrides.username);
  if (overrides.password !== undefined) url.password = encodeURIComponent(overrides.password);
  return url.href;
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
