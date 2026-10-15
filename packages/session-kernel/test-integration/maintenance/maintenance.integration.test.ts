import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  createUnifiedSessionInventory,
  createUnifiedSessionMaintenance,
  createUnifiedSessionVerifier,
  type UnifiedSessionInventoryRedis,
} from "@iam/session-kernel/maintenance";
import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
import Redis from "ioredis";
import { closeRedisTestClient, resetRedisTestCase } from "../support/redis-test-harness";

test("maintenance clears all owner versions and Redis types using only SCAN and UNLINK", async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL is required");
  const redis = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  const namespace = `test:maintenance:${randomUUID()}:`;
  let failure: unknown;
  try {
    await redis.ping();
    const fixture = createSessionMaintenanceTestFixture(redis, namespace);
    const targetKeys = await fixture.seedVersionedKeys();
    const sentinel = `${namespace.slice(0, -1)}:unified:v1:untouched`;
    await redis.set(sentinel, "preserved");
    const scanOnly: UnifiedSessionInventoryRedis = { scan: (...args) => redis.scan(...args) };
    const inventory = createUnifiedSessionInventory(scanOnly, namespace);
    let cursor = "0";
    let matching = 0;
    do {
      const page = await inventory.inventory({ cursor, limit: 1 });
      expect(page.matching).toBeLessThanOrEqual(1);
      expect(page.unknown).toBe(0);
      matching += page.matching;
      cursor = page.nextCursor;
    } while (cursor !== "0");
    expect(matching).toBe(targetKeys.length);
    const maintenance = createUnifiedSessionMaintenance(
      { ...scanOnly, unlink: (...keys) => redis.unlink(...keys) },
      namespace,
    );
    let removed = 0;
    do {
      const page = await maintenance.apply({ cursor, limit: 1 });
      expect(page.matching).toBeLessThanOrEqual(1);
      expect(page.unknown).toBe(0);
      removed += page.removed;
      cursor = page.nextCursor;
    } while (cursor !== "0");
    expect(removed).toBe(targetKeys.length);
    const verified = await createUnifiedSessionVerifier(scanOnly, namespace).verify();
    expect(verified).toEqual({ matching: 0 });
    const preserved = await redis.get(sentinel);
    expect(preserved).toBe("preserved");
  } catch (error) {
    failure = error;
  }
  try {
    await resetRedisTestCase(() => closeRedisTestClient(redis));
  } catch (error) {
    if (failure !== undefined) throw new AggregateError([failure, error], "Kernel maintenance test and reset failed");
    throw error;
  }
  if (failure !== undefined) throw failure;
});
