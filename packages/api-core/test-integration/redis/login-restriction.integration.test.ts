import type { LoginRestriction } from "../../src/login-restriction";
import type {
  RedisTestHarness,
  RedisTestScope,
} from "./redis-test-harness";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

let harness: RedisTestHarness | undefined;
let scope: RedisTestScope | undefined;
let writer: LoginRestriction;
let observer: LoginRestriction;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createScope();
  writer = scope.writer;
  observer = scope.observer;
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("LoginRestriction real Redis contract", () => {
  test("failures from independent clients are not lost and the threshold restriction is indexed atomically", async () => {
    const attempts = Array.from({ length: 25 }, (_, index) => ({
      client: index % 2 === 0 ? writer : observer,
      triggerMethod: index % 2 === 0 ? "password" as const : "mobile" as const,
      userId: 1001,
    }));

    const results = await Promise.all(attempts.map(async ({ client, ...input }) => ({
      input,
      result: await client.recordFailure(input),
    })));

    expect(results.map(item => item.result.failureCount).sort((left, right) => left - right))
      .toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(results.filter(item => item.result.newlyRestricted)).toHaveLength(1);
    const thresholdResult = results.find(item => item.result.failureCount === 5)!;
    const restriction = await observer.getRestriction(1001);
    expect(restriction).toMatchObject({
      cause: "too_many_login_failures",
      triggerMethod: thresholdResult.input.triggerMethod,
      userId: 1001,
    });
    const inventory = await writer.listRestrictions({
      limit: 20,
      offset: 0,
    });
    expect(inventory).toMatchObject({
      items: [{
        cause: "too_many_login_failures",
        triggerMethod: thresholdResult.input.triggerMethod,
        userId: 1001,
      }],
      total: 1,
    });
  });

  test("restriction state and inventory never expose a one-sided snapshot across independent clients", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await writer.recordFailure({
        triggerMethod: "password",
        userId: 1001,
      });
    }

    const thresholdTransition = writer.recordFailure({
      triggerMethod: "mobile",
      userId: 1001,
    });
    const creationObservations = Promise.all(Array.from({ length: 40 }, async (_, index) => {
      if (index % 2 === 0) {
        const restriction = await observer.getRestriction(1001);
        const inventory = await observer.listRestrictions({ limit: 20, offset: 0 });
        if (restriction !== null)
          expect(inventory.items.map(item => item.userId)).toContain(1001);
        return;
      }

      const inventory = await observer.listRestrictions({ limit: 20, offset: 0 });
      const restriction = await observer.getRestriction(1001);
      if (inventory.items.some(item => item.userId === 1001))
        expect(restriction).not.toBeNull();
    }));

    const thresholdResult = await thresholdTransition;
    expect(thresholdResult).toMatchObject({
      failureCount: 5,
      newlyRestricted: true,
    });
    await creationObservations;
    const restrictionAfterCreation = await observer.getRestriction(1001);
    expect(restrictionAfterCreation).not.toBeNull();
    const inventoryAfterCreation = await observer.listRestrictions({
      limit: 20,
      offset: 0,
    });
    expect(inventoryAfterCreation)
      .toMatchObject({ items: [{ userId: 1001 }], total: 1 });

    const clearTransition = writer.clearLoginState(1001);
    const clearObservations = Promise.all(Array.from({ length: 40 }, async (_, index) => {
      if (index % 2 === 0) {
        const restriction = await observer.getRestriction(1001);
        const inventory = await observer.listRestrictions({ limit: 20, offset: 0 });
        if (restriction === null)
          expect(inventory.items.map(item => item.userId)).not.toContain(1001);
        return;
      }

      const inventory = await observer.listRestrictions({ limit: 20, offset: 0 });
      const restriction = await observer.getRestriction(1001);
      if (!inventory.items.some(item => item.userId === 1001))
        expect(restriction).toBeNull();
    }));

    const clearResult = await clearTransition;
    expect(clearResult).toMatchObject({ changed: true });
    await clearObservations;
    const restrictionAfterClear = await observer.getRestriction(1001);
    expect(restrictionAfterClear).toBeNull();
    const inventoryAfterClear = await observer.listRestrictions({
      limit: 20,
      offset: 0,
    });
    expect(inventoryAfterClear).toEqual({ items: [], total: 0 });
  });

  test("clear and a concurrent failure are linearized across independent clients", async () => {
    for (let round = 0; round < 20; round += 1) {
      const userId = 2_000 + round;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await writer.recordFailure({
          triggerMethod: "password",
          userId,
        });
      }

      const [cleared, recorded] = await Promise.all([
        writer.clearLoginState(userId),
        observer.recordFailure({ triggerMethod: "mobile", userId }),
      ]);

      if (recorded.failureCount === 5) {
        expect(recorded.newlyRestricted).toBe(true);
        expect(cleared.changed).toBe(true);
      }
      else {
        expect(recorded).toEqual({
          failureCount: 1,
          newlyRestricted: false,
          remainingAttempts: 4,
          restriction: null,
        });
        expect(cleared.changed).toBe(false);
      }

      const restriction = await observer.getRestriction(userId);
      expect(restriction).toBeNull();
      const inventory = await observer.listRestrictions({
        limit: 1,
        offset: 0,
        userId,
      });
      expect(inventory).toEqual({
        items: [],
        total: 0,
      });

      const nextFailure = await writer.recordFailure({
        triggerMethod: "password",
        userId,
      });
      expect(nextFailure.failureCount).toBe(recorded.failureCount === 5 ? 1 : 2);
    }
  });

  test("a skewed observer lists every near-simultaneous expiration once in stable order", async () => {
    for (const userId of [1001, 2002, 3003]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await writer.recordFailure({
          triggerMethod: attempt % 2 === 0 ? "password" : "mobile",
          userId,
        });
      }
    }

    const result = await observer.listRestrictions({
      limit: 3,
      offset: 0,
    });

    expect(result.items.map(item => item.userId).sort((left, right) => left - right))
      .toEqual([1001, 2002, 3003]);
    expect(new Set(result.items.map(item => item.userId)).size).toBe(3);
    expect(result.items.map(item => item.restrictedUntil))
      .toEqual([...result.items]
        .map(item => item.restrictedUntil)
        .sort((left, right) => right - left));
    expect(result.total).toBe(3);
  });
});
