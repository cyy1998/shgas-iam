import Redis from "ioredis";

/** Kernel only owns one case executor; a failed stop prevents the exclusive reset. */
export async function resetRedisTestCase(stopExecutor: () => Promise<void> | void) {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url) throw new Error("Managed Kernel Redis URL is required");
  const control = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  const failures: unknown[] = [];
  try {
    await stopExecutor();
    await control.connect();
    await control.flushdb();
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await closeRedisTestClient(control);
    } catch (error) {
      failures.push(error);
    } finally {
      control.disconnect();
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Kernel Redis case reset failed");
}

export async function closeRedisTestClient(redis: Redis) {
  const ended = redis.status === "end" ? Promise.resolve() : new Promise<void>((resolve) => redis.once("end", resolve));
  try {
    if (redis.status !== "wait" && redis.status !== "end") await redis.quit();
  } finally {
    redis.disconnect();
    await ended;
  }
}
