import { expect, test } from "bun:test";
import { createExclusiveRedisTestHarness, runWithOwnedTestResources } from "@iam/test-support/external-test-resources";

test("closing one scope preserves another until the case reset stops every scope", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const harness = createExclusiveRedisTestHarness({
      environment: process.env,
      name: "IAM_TEST_SUPPORT_TEST_REDIS_URL",
    });
    registerCleanup(harness.close);
    const first = await harness.openPair();
    const second = await harness.openPair();
    await second.first.set("fixture-data", "present");
    await first.close();
    const data = await second.second.get("fixture-data");
    expect(data).toBe("present");
    await harness.reset();
    const nextCase = await harness.openPair();
    const remaining = await nextCase.first.dbsize();
    expect(remaining).toBe(0);
  });
});
