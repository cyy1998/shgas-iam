import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { factsRecord } from "../../../src/user/__tests__/document-fixture";
import type { DocumentFactsCacheRecord } from "../../../src/user/subject-facts";
import { createRedisTestHarness } from "../support/redis-test-harness";

const SUBJECT_IDENTIFIER = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Facts Redis publisher", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });
  afterEach(async () => {
    await harness?.reset();
  });

  test("compares source versions without losing bigint precision", async () => {
    const scope = await harness.createScope();
    const higherVersion = "9007199254740993";
    await scope.firstFactsPublisher.publish(cacheRecord(higherVersion));

    const retained = await scope.secondFactsPublisher.publish(cacheRecord("9007199254740992"));
    expect(retained).toEqual({ status: "retained-newer" });
    const published = await scope.readPublishedUserDocumentRecord(SUBJECT_IDENTIFIER);
    expect(published).toEqual(cacheRecord(higherVersion));
  });

  test("reads the same schema-valid record through the read-through cache adapter", async () => {
    const scope = await harness.createScope();
    const record = cacheRecord("13");
    await scope.firstCache.publish(record);

    const stored = await scope.secondCache.read(SUBJECT_IDENTIFIER);

    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(record);
  });

  test("batch prewarming retains newer Facts while publishing and inspecting missing subjects", async () => {
    const scope = await harness.createScope();
    const secondSubject = "46739d0b-cdda-48f5-af1f-1f90e2d81170";
    await scope.firstFactsPublisher.publish(cacheRecord("20"));

    const publication = await scope.firstFactsPublisher.publishMany([
      cacheRecord("19"),
      cacheRecord("1", secondSubject),
    ]);
    expect(publication).toEqual({ published: 1, retainedNewer: 1 });
    const published = await scope.readPublishedUserDocumentRecord(SUBJECT_IDENTIFIER);
    expect(published).toEqual(cacheRecord("20"));
    const inspected = await scope.factsInspector.inspectMany([SUBJECT_IDENTIFIER, secondSubject]);
    expect(inspected).toEqual([
      {
        status: "valid",
        record: cacheRecord("20"),
      },
      {
        status: "valid",
        record: cacheRecord("1", secondSubject),
      },
    ]);
  });
});

function cacheRecord(sourceVersion: string, subjectIdentifier = SUBJECT_IDENTIFIER) {
  return { ...factsRecord(1, sourceVersion), subjectIdentifier };
}
