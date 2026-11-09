import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { factsRecord, publication } from "../../../src/user/__tests__/document-fixture";
import { createDocumentFactsCacheRecord } from "../../../src/user/document";
import type { DocumentFactsCacheRecord } from "../../../src/user/subject-facts";
import { createRedisTestHarness } from "../support/redis-test-harness";

const subjectIdentifier = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Document Facts Redis publisher", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });
  afterEach(async () => {
    await harness?.reset();
  });

  test("retains the greatest source version across concurrent publishers", async () => {
    const scope = await harness.createScope();
    await Promise.all([
      scope.firstFactsPublisher.publish(record("12")),
      scope.secondFactsPublisher.publish(record("9")),
      scope.firstFactsPublisher.publish(record("11")),
    ]);

    const published = await scope.readPublishedUserDocumentRecord(subjectIdentifier);
    expect(published).toEqual(record("12"));
    const retained = await scope.secondFactsPublisher.publish(record("10"));
    expect(retained).toEqual({ status: "retained-newer" });
  });

  test("a deletion tombstone rejects delayed full Facts including a duplicate version beyond numeric precision", async () => {
    const scope = await harness.createScope();
    const deletedVersion = "9007199254740993";
    const deleted = tombstone(deletedVersion);
    await scope.firstFactsPublisher.publish(record("9007199254740992"));
    await scope.secondFactsPublisher.publish(deleted);

    const older = await scope.firstFactsPublisher.publish(record("9007199254740992"));
    const duplicate = await scope.firstFactsPublisher.publish(record(deletedVersion));
    const retained = await scope.readPublishedUserDocumentRecord(subjectIdentifier);
    expect(older.status).toBe("retained-newer");
    expect(duplicate.status).toBe("retained-newer");
    expect(retained).toEqual(deleted);
  });

  test("a tombstone clears a complete record's expiry and fences delayed publication beyond its old deadline", async () => {
    const scope = await harness.createScope();
    const complete = record("31");
    const deleted = tombstone("32");
    await scope.firstFactsPublisher.publish(complete);
    await scope.expirePublishedUserDocumentRecord(subjectIdentifier, 100);
    const originalExpiry = performance.now() + 100;
    await scope.secondFactsPublisher.publish(deleted);
    const ttl = await scope.readPublishedUserDocumentTtl(subjectIdentifier);
    expect(ttl).toBe(-1);

    // Observe the real Redis cache past the prior expiry rather than using a fake clock.
    while (performance.now() < originalExpiry) await scope.firstCache.read(subjectIdentifier);
    const delayed = await scope.firstFactsPublisher.publish(complete);
    const retained = await scope.readPublishedUserDocumentRecord(subjectIdentifier);
    const retainedTtl = await scope.readPublishedUserDocumentTtl(subjectIdentifier);
    expect(delayed.status).toBe("retained-newer");
    expect(retained).toEqual(deleted);
    expect(retainedTtl).toBe(-1);
  });

  test("inspects the exact requested records without scanning", async () => {
    const scope = await harness.createScope();
    await scope.firstFactsPublisher.publish(record("4"));

    const inspected = await scope.factsInspector.inspectMany([
      subjectIdentifier,
      "46739d0b-cdda-48f5-af1f-1f90e2d81170",
    ]);
    expect(inspected).toEqual([{ status: "valid", record: record("4") }, { status: "missing" }]);
  });
});

function record(sourceVersion: string): Extract<DocumentFactsCacheRecord, { kind: "document" }> {
  return { ...factsRecord(1, sourceVersion), subjectIdentifier: subjectIdentifier };
}

function tombstone(sourceVersion: string) {
  return createDocumentFactsCacheRecord({ ...publication(1, sourceVersion), subjectIdentifier, document: null });
}
