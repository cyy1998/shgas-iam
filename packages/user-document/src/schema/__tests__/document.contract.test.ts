import { expect, test } from "bun:test";
import { UserStatus, UserType } from "@iam/contracts";
import {
  createDocumentFactsCacheRecord,
  DocumentFactsCacheRecordSchema,
  PublishedUserDocumentSchema,
  readDocumentFactsRecord,
} from "../../document";

const subjectIdentifier = "11111111-1111-4111-8111-111111111111";
const published = {
  userId: 42,
  subjectIdentifier,
  schemaVersion: 1 as const,
  sourceVersion: "9007199254740993",
  publishedAt: new Date("2026-10-26T00:00:00Z"),
  document: {
    user: {
      subjectIdentifier,
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Pause,
    },
    employments: [],
  },
};

test("document-derived Facts carry the publication identity and precise source version", () => {
  const record = createDocumentFactsCacheRecord(published);
  const result = readDocumentFactsRecord(JSON.stringify(record));
  expect(result).toEqual({
    kind: "document",
    record: {
      userId: 42,
      subjectIdentifier,
      schemaVersion: 1,
      sourceVersion: "9007199254740993",
      publishedAt: "2026-10-26T00:00:00.000Z",
      kind: "document",
      facts: { profile: { username: "alice", name: "Alice", phone: null }, employments: [] },
    },
    facts: {
      subjectIdentifier,
      sourceVersion: "9007199254740993",
      profile: { username: "alice", name: "Alice", phone: null },
      employments: [],
    },
  });
});

test("a versioned tombstone is distinguishable from missing Facts and cannot contain a complete profile", () => {
  const record = createDocumentFactsCacheRecord({ ...published, document: null });
  if (record.kind !== "tombstone") throw new Error("Expected a deletion tombstone");
  expect(readDocumentFactsRecord(null)).toEqual({ kind: "missing" });
  expect(readDocumentFactsRecord(JSON.stringify(record))).toEqual({ kind: "tombstone", record });
  expect(record).toEqual({
    userId: 42,
    subjectIdentifier,
    schemaVersion: 1,
    sourceVersion: "9007199254740993",
    publishedAt: "2026-10-26T00:00:00.000Z",
    kind: "tombstone",
  });
  expect(
    DocumentFactsCacheRecordSchema.safeParse({
      ...record,
      facts: { profile: { username: "old", name: "Old", phone: null }, employments: [] },
    }).success,
  ).toBe(false);
});

test("publication identity and source versions cannot be silently substituted", () => {
  expect(
    PublishedUserDocumentSchema.safeParse({ ...published, subjectIdentifier: "22222222-2222-4222-8222-222222222222" })
      .success,
  ).toBe(false);
  expect(PublishedUserDocumentSchema.safeParse({ ...published, sourceVersion: Number.MAX_SAFE_INTEGER }).success).toBe(
    false,
  );
});
