import { expect, test } from "bun:test";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";
import { createRedisTestHarness } from "./redis-test-harness";

test("closing a Subject Facts scope preserves another until the case resets", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const harness = await createRedisTestHarness();
    registerCleanup(harness.close);
    const first = await harness.createScope();
    const second = await harness.createScope();
    const record = {
      schemaVersion: 3 as const,
      sourceDirtyVersion: "1",
      publishedAt: "2026-07-25T10:00:00.000Z",
      subjectIdentifier: "46739d0b-cdda-48f5-af1f-1f90e2d81169",
      profile: { username: "alice", name: "Alice", phone: null },
      facts: { employments: [] },
    };
    await second.firstProfilePublisher.publish(record);
    await first.close();
    const retained = await second.readPublishedProfileRecord(record.subjectIdentifier);
    expect(retained).toEqual(record);
    await harness.reset();
    const nextCase = new Redis(process.env.IAM_USER_PROFILE_TEST_REDIS_URL!, {
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
