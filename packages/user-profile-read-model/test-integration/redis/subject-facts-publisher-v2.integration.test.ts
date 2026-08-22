import type { SubjectFactsCacheRecord } from "../../src/subject-facts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

const subjectIdentifier = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Facts V2 Redis publisher", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("retains the greatest V2 Dirty Version across concurrent publishers", async () => {
    const scope = await harness.createScope();
    try {
      await Promise.all([
        scope.firstProfilePublisher.publish(record("12")),
        scope.secondProfilePublisher.publish(record("9")),
        scope.firstProfilePublisher.publish(record("11")),
      ]);

      expect(await scope.readPublishedProfileRecord(subjectIdentifier)).toEqual(record("12"));
      expect(await scope.secondProfilePublisher.publish(record("10")))
        .toEqual({ status: "retained-newer" });
    }
    finally {
      await scope.close();
    }
  });

  test("inspects the exact requested V2 records without scanning", async () => {
    const scope = await harness.createScope();
    try {
      await scope.firstProfilePublisher.publish(record("4"));

      await expect(scope.profileInspector.inspectMany([
        subjectIdentifier,
        "46739d0b-cdda-48f5-af1f-1f90e2d81170",
      ])).resolves.toEqual([
        { status: "valid", record: record("4") },
        { status: "missing" },
      ]);
    }
    finally {
      await scope.close();
    }
  });
});

function record(sourceDirtyVersion: string): SubjectFactsCacheRecord {
  return {
    schemaVersion: 2,
    sourceDirtyVersion,
    publishedAt: "2026-08-20T12:00:00.000Z",
    subjectIdentifier,
    profile: {
      username: "alice",
      name: "Alice",
      phone: "13800138000",
    },
    facts: { employments: [] },
  };
}
