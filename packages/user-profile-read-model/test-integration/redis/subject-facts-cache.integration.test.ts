import type { SubjectFactsCacheRecord } from "../../src/subject-facts";
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

  test("compares dirty versions without losing bigint precision", async () => {
    const scope = await harness.createScope();
    try {
      const higherVersion = "9007199254740993";
      await scope.firstProfilePublisher.publish(cacheRecord(higherVersion));

      const retained = await scope.secondProfilePublisher.publish(cacheRecord("9007199254740992"));
      expect(retained)
        .toEqual({ status: "retained-newer" });
      const published = await scope.readPublishedProfileRecord(SUBJECT_IDENTIFIER);
      expect(published)
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
      await scope.firstProfilePublisher.publish(cacheRecord("20"));

      const publication = await scope.firstProfilePublisher.publishMany([
        cacheRecord("19"),
        cacheRecord("1", secondSubject),
      ]);
      expect(publication).toEqual({ published: 1, retainedNewer: 1 });
      const published = await scope.readPublishedProfileRecord(SUBJECT_IDENTIFIER);
      expect(published)
        .toEqual(cacheRecord("20"));
      const inspected = await scope.profileInspector.inspectMany([
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
): SubjectFactsCacheRecord {
  return {
    schemaVersion: 3,
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
        responsibilities: [],
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
