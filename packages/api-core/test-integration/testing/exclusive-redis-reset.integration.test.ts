import { expect, test } from "bun:test";
import Redis from "ioredis";
import { resetExclusiveRedisTestDatabase } from "../../src/testing/external-test-resources";

async function connection() {
  const url = process.env.IAM_API_CORE_TEST_REDIS_URL;
  if (!url) throw new Error("Managed Core Redis URL is required");
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null });
  await redis.connect();
  return redis;
}

test("stops the case connection and resets unexpired data before the next case starts", async () => {
  const writer = await connection();
  const control = await connection();
  try {
    await writer.set("fixture-data", "present");
    await writer.set("fixture-lock", "present", "PX", 30_000);
    const remainingLockMs = await writer.pttl("fixture-lock");
    expect(remainingLockMs).toBeGreaterThan(0);
    await resetExclusiveRedisTestDatabase({
      redis: control,
      stopExecutors: [
        async () => {
          await writer.quit();
        },
      ],
    });
    const nextCase = await connection();
    try {
      const size = await nextCase.dbsize();
      expect(size).toBe(0);
    } finally {
      await nextCase.quit();
    }
  } finally {
    writer.disconnect();
    await control.quit();
  }
});

test("a failed executor stop preserves the data until that executor can be stopped", async () => {
  const writer = await connection();
  const control = await connection();
  const stopFailure = new Error("executor is still active");
  let caught: unknown;
  try {
    await writer.set("active-executor-data", "present");
    try {
      await resetExclusiveRedisTestDatabase({
        redis: control,
        stopExecutors: [
          async () => {
            throw stopFailure;
          },
        ],
      });
    } catch (error) {
      caught = error;
    }
    const data = await writer.get("active-executor-data");
    expect(caught instanceof AggregateError ? caught.errors : []).toEqual([stopFailure]);
    expect(data).toBe("present");
    await resetExclusiveRedisTestDatabase({
      redis: control,
      stopExecutors: [
        async () => {
          await writer.quit();
        },
      ],
    });
  } finally {
    writer.disconnect();
    await control.quit();
  }
});

test("a Redis reset failure remains an operation failure after the executor has stopped", async () => {
  const writer = await connection();
  const control = await connection();
  let stopped = false;
  let caught: unknown;
  try {
    await control.quit();
    try {
      await resetExclusiveRedisTestDatabase({
        redis: control,
        stopExecutors: [
          async () => {
            await writer.quit();
            stopped = true;
          },
        ],
      });
    } catch (error) {
      caught = error;
    }
    expect(stopped).toBe(true);
    expect(caught).toBeInstanceOf(Error);
  } finally {
    writer.disconnect();
    control.disconnect();
  }
});
