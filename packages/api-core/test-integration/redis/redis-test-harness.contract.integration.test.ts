import { expect, test } from "bun:test";
import Redis from "ioredis";
import { runWithOwnedTestResources } from "../../src/testing/external-test-resources";
import { createRedisTestHarness } from "./redis-test-harness";

test("closing one scope preserves another until the case reset stops every scope", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const harness = await createRedisTestHarness();
    registerCleanup(harness.close);
    const first = await harness.createScope();
    const second = await harness.createScope();
    for (let attempt = 0; attempt < 5; attempt++) {
      await second.writer.recordFailure({ userId: 1001, triggerMethod: "password" });
    }
    await first.close();
    const restriction = await second.observer.getRestriction(1001);
    expect(restriction).not.toBeNull();
    await harness.reset();
    const nextCase = new Redis(process.env.IAM_API_CORE_TEST_REDIS_URL!, {
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    registerCleanup(async () => {
      try {
        await nextCase.quit();
      } finally {
        nextCase.disconnect();
      }
    });
    const remaining = await nextCase.dbsize();
    expect(remaining).toBe(0);
  });
});
