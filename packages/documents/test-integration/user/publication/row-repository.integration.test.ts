import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { PublishedUserDocument } from "../../../src/user/document";
import { createUserDocumentRowRepository } from "../../../src/user/publication/user-document-row.repository";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-test-harness";

let harness: PostgresTestHarness;
beforeAll(async () => {
  harness = await createPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function tombstone(userId: number, sourceVersion: string): PublishedUserDocument {
  return {
    userId,
    sourceVersion,
    subjectIdentifier: `10000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
    schemaVersion: 1,
    publishedAt: new Date("2026-11-02T00:00:00Z"),
    document: null,
  };
}

test("bulk upsert reports only inserted or monotonic publications with exact bigint versions", async () => {
  const repository = createUserDocumentRowRepository(harness.db);
  await repository.upsert(tombstone(1, "9007199254740993"));
  await repository.upsert(tombstone(2, "2"));
  const ids = await repository.upsertMany([tombstone(3, "1"), tombstone(1, "9007199254740992"), tombstone(2, "2")]);
  const documents = await harness.sql`SELECT user_id,source_version,document FROM user_document ORDER BY user_id`;
  expect(ids.toSorted((left, right) => left - right)).toEqual([2, 3]);
  expect([...documents]).toEqual([
    { user_id: 1, source_version: "9007199254740993", document: null },
    { user_id: 2, source_version: "2", document: null },
    { user_id: 3, source_version: "1", document: null },
  ]);
});

test("bulk validation rejects conflicting targets before writing any document", async () => {
  const repository = createUserDocumentRowRepository(harness.db);
  let failure: unknown;
  try {
    await repository.upsertMany([tombstone(1, "1"), tombstone(1, "2")]);
  } catch (error) {
    failure = error;
  }
  const documents = await harness.sql`SELECT user_id FROM user_document`;
  expect(failure).toBeInstanceOf(Error);
  expect([...documents]).toEqual([]);
});
