import {
  resetExclusiveRedisTestDatabase,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";

const executors: Array<() => Promise<void>> = [];

export async function closeApiRedisConnection(redis: Redis) {
  if (redis.status === "end") return;
  const ended = new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status === "ready") await redis.quit();
  } finally {
    redis.disconnect();
    await ended;
  }
}

/** Scope close only stops executors; the outer case owns the shared database reset. */
export function ownApiTestExecutor(stop: () => unknown | Promise<unknown>): () => Promise<void> {
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= Promise.resolve().then(async () => {
      await stop();
    }));
  executors.push(close);
  return close;
}

export async function resetApiRedisTestDatabase() {
  const stops = executors.splice(0);
  if (!stops.length) return;
  const url = process.env.IAM_API_TEST_REDIS_URL;
  if (!url) {
    if (stops.length) throw new Error("IAM_API_TEST_REDIS_URL is required for API fixture reset");
    return;
  }
  const control = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    registerCleanup(() => closeApiRedisConnection(control));
    await resetExclusiveRedisTestDatabase({ redis: control, stopExecutors: stops });
  });
}
