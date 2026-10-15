import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createAdminApiRedisTestHarness } from "../support/redis-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
beforeAll(async () => {
  harness = await createAdminApiRedisTestHarness();
});
afterEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

test("scope close leaves shared case data available until all executors stop and the case resets", async () => {
  const first = await harness.createScope();
  const second = await harness.createScope();
  const key = first.clientCode("case-data");
  await first.redis.set(key, "observable-before-reset");
  await first.close();

  const retained = await second.observer.get(key);
  expect(retained).toBe("observable-before-reset");

  await harness.reset();
  expect([first.redis.status, first.observer.status, second.redis.status, second.observer.status]).toEqual([
    "end",
    "end",
    "end",
    "end",
  ]);
  const next = await harness.createScope();
  const remaining = await next.observer.dbsize();
  expect(remaining).toBe(0);
});
