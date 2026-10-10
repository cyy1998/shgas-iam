import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
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

test("maintenance clears all owner versions and Redis types using only SCAN and UNLINK", async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL is required");
  const redis = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  const namespace = `test:maintenance:${randomUUID()}:`;
  const tracked: string[] = [];
  try {
    await redis.ping();
    const fixture = createSessionMaintenanceTestFixture(redis, namespace, (key) => tracked.push(key));
    const targetKeys = await fixture.seedVersionedKeys();
    const sentinel = `${namespace.slice(0, -1)}:unified:v1:untouched`;
    tracked.push(sentinel);
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
  } finally {
    try {
      if (tracked.length) await redis.unlink(...tracked);
    } finally {
      redis.disconnect();
    }
  }
});

test("maintenance bounds COUNT overflow across removal batches", async () => {
  const namespace = `test:maintenance:${randomUUID()}`;
  const keys = ["v0:old", "v2:future", "unversioned"].map((suffix) => `${namespace}:unified:${suffix}`);
  let scans = 0;
  const batches: string[][] = [];
  const maintenance = createUnifiedSessionMaintenance(
    {
      async scan() {
        scans++;
        return ["0", keys];
      },
      async unlink(...batch) {
        batches.push(batch);
        return batch.length;
      },
    },
    namespace,
  );
  let cursor = "0";
  do {
    const page = await maintenance.apply({ cursor, limit: 1 });
    expect(page.matching).toBe(1);
    cursor = page.nextCursor;
  } while (cursor !== "0");
  expect(scans).toBe(1);
  expect(batches).toEqual(keys.map((key) => [key]));
});

test("maintenance rejects cursor keys outside the owner prefix without deleting", async () => {
  let removals = 0;
  const maintenance = createUnifiedSessionMaintenance(
    {
      scan: async () => ["0", []],
      async unlink() {
        removals++;
        return 1;
      },
    },
    "test:maintenance",
  );
  const outsideCursor = Buffer.from(JSON.stringify({ scan: "0", pending: ["other:unified:v1:record"] })).toString(
    "base64url",
  );
  let failure: unknown;
  try {
    await maintenance.apply({ cursor: outsideCursor });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(removals).toBe(0);
});

test("maintenance treats confirmed zero deletion as a known outcome", async () => {
  const namespace = `test:maintenance:${randomUUID()}`;
  const keys = [`${namespace}:unified:v2:record`];
  const noLongerPresent = await createUnifiedSessionMaintenance(
    { scan: async () => ["0", keys], unlink: async () => 0 },
    namespace,
  ).apply();
  expect(noLongerPresent).toEqual({ nextCursor: "0", matching: 1, removed: 0, unknown: 0 });
});

test("maintenance records response loss as unknown without claiming removal", async () => {
  const namespace = `test:maintenance:${randomUUID()}`;
  const keys = [`${namespace}:unified:v2:record`];
  const lost = await createUnifiedSessionMaintenance(
    {
      scan: async () => ["0", keys],
      async unlink() {
        throw new Error("Injected response loss");
      },
    },
    namespace,
  ).apply();
  expect(lost).toEqual({ nextCursor: "0", matching: 1, removed: 0, unknown: 1 });
});

test("verification fails when a scan exceeds its page budget", async () => {
  let failure: unknown;
  try {
    await createUnifiedSessionVerifier({ scan: async () => ["1", []] }, "test:maintenance").verify();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
});

test("verification fails when cancellation arrives during its final page", async () => {
  const controller = new AbortController();
  let failure: unknown;
  try {
    await createUnifiedSessionVerifier(
      {
        async scan() {
          controller.abort();
          return ["0", []];
        },
      },
      "test:maintenance",
    ).verify(controller.signal);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
});
