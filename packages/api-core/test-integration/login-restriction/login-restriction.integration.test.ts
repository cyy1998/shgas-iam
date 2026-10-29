import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { LoginRestriction } from "../../src/login-restriction";
import { LOGIN_FAILURE_WINDOW_SECONDS, LOGIN_RESTRICTION_DURATION_SECONDS } from "../../src/login-restriction";
import type { RedisTestHarness, RedisTestScope } from "../support/redis-test-harness";
import { createRedisTestHarness, waitForRedisCondition } from "../support/redis-test-harness";

let harness: RedisTestHarness;
let scope: RedisTestScope;
let writer: LoginRestriction;
let observer: LoginRestriction;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  scope = await harness.createScope();
  writer = scope.writer;
  observer = scope.observer;
});
afterEach(async () => {
  await harness?.reset();
});
afterAll(async () => {
  await harness?.close();
});

async function recordFailures(userId: number, count = 5) {
  for (let attempt = 0; attempt < count; attempt += 1) {
    await writer.recordFailure({ triggerMethod: "password", userId });
  }
}

function releaseTogether<T>(operations: readonly (() => Promise<T>)[]) {
  const gate = Promise.withResolvers<void>();
  const pending = operations.map(async (operation) => {
    await gate.promise;
    return await operation();
  });
  // Both connected clients have reached the same start gate before either operation runs.
  gate.resolve();
  return Promise.all(pending);
}

describe("LoginRestriction real Redis contract", () => {
  test("independent clients count mixed failures once and create one indexed restriction at the threshold", async () => {
    await recordFailures(1001, 4);
    const inputs = [
      { triggerMethod: "password" as const, userId: 1001 },
      { triggerMethod: "mobile" as const, userId: 1001 },
    ];
    const results = await releaseTogether([
      () => writer.recordFailure(inputs[0]!),
      () => observer.recordFailure(inputs[1]!),
    ]);
    expect(results.map((result) => result.failureCount).sort()).toEqual([5, 6]);
    expect(results.filter((result) => result.newlyRestricted)).toHaveLength(1);
    const thresholdIndex = results.findIndex((result) => result.failureCount === 5);
    const threshold = results[thresholdIndex]!;
    expect(threshold).toMatchObject({ newlyRestricted: true, remainingAttempts: 0 });
    const restriction = await observer.getRestriction(1001);
    expect(restriction).toEqual({
      cause: "too_many_login_failures",
      remainingSeconds: expect.any(Number),
      restrictedUntil: expect.any(Number),
      triggerMethod: inputs[thresholdIndex]!.triggerMethod,
      userId: 1001,
    });
    const stored = await scope.inspectLoginState(1001);
    expect(stored.restrictionTtl).toBeGreaterThan(LOGIN_RESTRICTION_DURATION_SECONDS * 1_000 - 4_000);
    expect(stored.restrictionTtl).toBeLessThanOrEqual(LOGIN_RESTRICTION_DURATION_SECONDS * 1_000);
    expect(Math.abs(Number(stored.indexedUntil) - threshold.restriction!.restrictedUntil)).toBeLessThanOrEqual(5);
    const inventory = await observer.listRestrictions({ limit: 1, offset: 0 });
    expect(inventory).toMatchObject({
      items: [{ userId: 1001, triggerMethod: inputs[thresholdIndex]!.triggerMethod }],
      total: 1,
    });
  });

  test("rolling window cleanup removes old members from a still-live failure key", async () => {
    await scope.seedFailureHistory(1001, [
      LOGIN_FAILURE_WINDOW_SECONDS * 1_000 + 10_000,
      LOGIN_FAILURE_WINDOW_SECONDS * 1_000 + 9_000,
      LOGIN_FAILURE_WINDOW_SECONDS * 1_000 + 8_000,
      LOGIN_FAILURE_WINDOW_SECONDS * 1_000 + 7_000,
      1_000,
    ]);
    const result = await writer.recordFailure({ triggerMethod: "mobile", userId: 1001 });
    expect(result).toEqual({ failureCount: 2, newlyRestricted: false, remainingAttempts: 3, restriction: null });
    const stored = await scope.inspectLoginState(1001);
    expect(stored.failureCount).toBe(2);
  });

  test("clear removes restriction, history and index, allowing immediate counting from one", async () => {
    await recordFailures(1001);
    const cleared = await observer.clearLoginState(1001);
    expect(cleared).toMatchObject({
      changed: true,
      failureStateCleared: true,
      restriction: { cause: "too_many_login_failures", triggerMethod: "password", userId: 1001 },
    });
    const stored = await scope.inspectLoginState(1001);
    expect(stored).toEqual({ failureCount: 0, restrictionTtl: -2, indexedUntil: null });
    const repeated = await writer.clearLoginState(1001);
    expect(repeated).toEqual({ changed: false, failureStateCleared: true, restriction: null });
    const next = await writer.recordFailure({ triggerMethod: "mobile", userId: 1001 });
    expect(next).toEqual({ failureCount: 1, newlyRestricted: false, remainingAttempts: 4, restriction: null });
  });

  test("a concurrent clear and failure produce a legal serial outcome", async () => {
    await recordFailures(1001, 4);
    const gate = Promise.withResolvers<void>();
    const clear = (async () => {
      await gate.promise;
      return await writer.clearLoginState(1001);
    })();
    const failure = (async () => {
      await gate.promise;
      return await observer.recordFailure({ triggerMethod: "mobile", userId: 1001 });
    })();
    gate.resolve();
    const [cleared, recorded] = await Promise.all([clear, failure]);
    if (recorded.failureCount === 5) {
      expect(recorded.newlyRestricted).toBe(true);
      expect(cleared.changed).toBe(true);
    } else {
      expect(recorded).toEqual({ failureCount: 1, newlyRestricted: false, remainingAttempts: 4, restriction: null });
      expect(cleared.changed).toBe(false);
    }
    const stored = await scope.inspectLoginState(1001);
    expect(stored).toEqual({
      failureCount: recorded.failureCount === 5 ? 0 : 1,
      restrictionTtl: -2,
      indexedUntil: null,
    });
  });

  test.each(["get", "list"] as const)(
    "%s removes an expired restriction from inventory without another reader cleaning first",
    async (operation) => {
      await recordFailures(1001);
      await scope.setRestrictionExpiries([{ userId: 1001, remainingMilliseconds: 100 }]);
      // Keep a future index score so cleanup must observe the expired authoritative key.
      await scope.seedRestrictionIndex(1001, 60_000);
      await waitForRedisCondition(
        async () => (await scope.inspectLoginState(1001)).restrictionTtl === -2,
        "restriction did not expire",
      );
      if (operation === "get") {
        const result = await observer.getRestriction(1001);
        expect(result).toBeNull();
      } else {
        const result = await observer.listRestrictions({ limit: 1, offset: 0 });
        expect(result).toEqual({ items: [], total: 0 });
      }
      const stored = await scope.inspectLoginState(1001);
      expect(stored.indexedUntil).toBeNull();
    },
  );

  test("a skewed observer pages valid restrictions in expiry order while repairing stale index members", async () => {
    for (const userId of [1001, 2002, 3003]) await recordFailures(userId);
    await scope.setRestrictionExpiries([
      { userId: 1001, remainingMilliseconds: 60_003 },
      { userId: 2002, remainingMilliseconds: 60_002 },
      { userId: 3003, remainingMilliseconds: 60_001 },
    ]);
    // The dangling entry sorts first, so page traversal must repair it before counting offsets.
    await scope.seedRestrictionIndex(4004, 120_000);
    await scope.seedRestrictionIndex(5005, -1_000);
    const pages = [];
    for (let offset = 0; offset < 4; offset += 1) {
      pages.push(await observer.listRestrictions({ limit: 1, offset }));
    }
    expect(pages.map((page) => page.items.map((item) => item.userId))).toEqual([[1001], [2002], [3003], []]);
    expect(pages.map((page) => page.total)).toEqual([3, 3, 3, 3]);
    const dangling = await scope.inspectLoginState(4004);
    const expired = await scope.inspectLoginState(5005);
    expect(dangling.indexedUntil).toBeNull();
    expect(expired.indexedUntil).toBeNull();
  });

  test("an effective restriction is readable even when its inventory index is missing", async () => {
    await recordFailures(1001);
    await scope.removeRestrictionIndex(1001);
    const restriction = await observer.getRestriction(1001);
    expect(restriction).toMatchObject({ triggerMethod: "password", userId: 1001 });
  });
});
