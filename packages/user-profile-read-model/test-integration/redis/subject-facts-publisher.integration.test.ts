import type { SubjectFactsCacheRecordV1 } from "../../src/worker";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

const SUBJECT_IDENTIFIER = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Facts Redis publisher", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("atomically retains the greatest dirty version across concurrent publishers", async () => {
    const scope = await harness.createScope();
    try {
      const versions = ["2", "11", "3", "10", "1", "12"];
      await Promise.all(versions.map((version, index) =>
        (index % 2 === 0 ? scope.firstPublisher : scope.secondPublisher)
          .publish(cacheRecord(version))));

      expect(await scope.readPublishedRecord(SUBJECT_IDENTIFIER))
        .toEqual(cacheRecord("12"));
      await expect(scope.firstPublisher.publish(cacheRecord("11")))
        .resolves
        .toEqual({ status: "retained-newer" });
      expect(await scope.readPublishedRecord(SUBJECT_IDENTIFIER))
        .toEqual(cacheRecord("12"));
    }
    finally {
      await scope.close();
    }
  });

  test("compares dirty versions without losing bigint precision", async () => {
    const scope = await harness.createScope();
    try {
      const higherVersion = "9007199254740993";
      await scope.firstPublisher.publish(cacheRecord(higherVersion));

      await expect(scope.secondPublisher.publish(cacheRecord("9007199254740992")))
        .resolves
        .toEqual({ status: "retained-newer" });
      expect(await scope.readPublishedRecord(SUBJECT_IDENTIFIER))
        .toEqual(cacheRecord(higherVersion));
    }
    finally {
      await scope.close();
    }
  });

  test("reads the same schema-valid record through the read-through cache adapter", async () => {
    const scope = await harness.createScope();
    try {
      const record = cacheRecord("13");
      await scope.firstCache.publish(record);

      const stored = await scope.secondCache.read(SUBJECT_IDENTIFIER);

      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(record);
    }
    finally {
      await scope.close();
    }
  });

  test("batch prewarming retains newer Facts while publishing and inspecting missing subjects", async () => {
    const scope = await harness.createScope();
    const secondSubject = "46739d0b-cdda-48f5-af1f-1f90e2d81170";
    try {
      await scope.firstPublisher.publish(cacheRecord("20"));

      const publication = await scope.batchPublisher.publishMany([
        cacheRecord("19"),
        cacheRecord("1", secondSubject),
      ]);
      expect(publication).toEqual({ published: 1, retainedNewer: 1 });
      expect(await scope.readPublishedRecord(SUBJECT_IDENTIFIER))
        .toEqual(cacheRecord("20"));
      const inspected = await scope.inspector.inspectMany([
        SUBJECT_IDENTIFIER,
        secondSubject,
      ]);
      expect(inspected).toEqual([{
        status: "valid",
        record: cacheRecord("20"),
      }, {
        status: "valid",
        record: cacheRecord("1", secondSubject),
      }]);
    }
    finally {
      await scope.close();
    }
  });
});

function cacheRecord(
  sourceDirtyVersion: string,
  subjectIdentifier = SUBJECT_IDENTIFIER,
): SubjectFactsCacheRecordV1 {
  return {
    schemaVersion: 1,
    sourceDirtyVersion,
    publishedAt: "2026-07-25T10:00:00.000Z",
    subjectIdentifier,
    profile: {
      username: "alice",
      name: "Alice",
      phone: "13800138000",
    },
    facts: {
      employments: [{
        isPrimary: true,
        organization: {
          code: "product",
          name: "Product",
          type: "department",
          path: [{
            code: "company",
            name: "Example Company",
            type: "company",
          }, {
            code: "product",
            name: "Product",
            type: "department",
          }],
        },
        position: {
          code: "engineer",
          name: "Engineer",
        },
        clientAuthorizations: [{
          clientCode: "console",
          roles: [{
            code: "operator",
            privileges: ["subject:read"],
          }],
        }],
      }],
    },
  };
}
