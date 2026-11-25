import { resetExclusiveRedisTestDatabase, runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import Redis from "ioredis";

const executors: Array<() => Promise<void>> = [];

export async function closeAuthApiRedisConnection(redis: Redis) {
  const { status: initialStatus } = redis;
  if (initialStatus === "end") return;
  if (initialStatus === "reconnecting") {
    // ioredis 6.0.0 (#2245): disconnect() during reconnecting clears the timer without emitting "end".
    redis.disconnect();
    return;
  }
  const ended = new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status === "ready") await redis.quit();
  } finally {
    if (redis.status === "reconnecting") {
      redis.disconnect();
    } else {
      redis.disconnect();
      if (redis.status !== "end") await ended;
    }
  }
}

/** Scope close only stops executors; the outer case owns the shared database reset. */
export function ownAuthApiTestExecutor(stop: () => unknown | Promise<unknown>): () => Promise<void> {
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= Promise.resolve().then(async () => {
      await stop();
    }));
  executors.push(close);
  return close;
}

export async function resetAuthApiRedisTestDatabase() {
  const stops = executors.splice(0);
  if (!stops.length) return;
  const url = process.env.IAM_AUTH_API_TEST_REDIS_URL;
  if (!url) {
    if (stops.length) throw new Error("IAM_AUTH_API_TEST_REDIS_URL is required for API fixture reset");
    return;
  }
  const control = new Redis(url, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    registerCleanup(() => closeAuthApiRedisConnection(control));
    await resetExclusiveRedisTestDatabase({
      redis: {
        async flushdb() {
          await control.connect();
          await control.ping();
          return await control.flushdb();
        },
      },
      stopExecutors: stops,
    });
  });
}

export async function closeFixtureResources(tasks: Array<() => unknown | Promise<unknown>>) {
  const failures: unknown[] = [];
  for (const task of tasks.toReversed()) {
    try {
      await task();
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Auth API fixture resource cleanup failed");
}

export async function cleanupAfterFixtureFailure(failure: unknown, close: () => Promise<void>): Promise<never> {
  try {
    await close();
  } catch (cleanupFailure) {
    throw new AggregateError([failure, cleanupFailure], "Auth API fixture initialization and cleanup failed", {
      cause: failure,
    });
  }
  throw failure;
}
