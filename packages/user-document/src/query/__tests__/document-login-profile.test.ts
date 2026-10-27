import { expect, test } from "bun:test";
import { deriveDocumentLoginProfile } from "../../document-query";

test("narrow login facts do not depend on unrelated employment integrity", () => {
  const publication = {
    userId: 1,
    subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
    schemaVersion: 1,
    sourceVersion: "8",
    publishedAt: new Date("2026-10-26T10:00:00.000Z"),
    document: {
      user: {
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        username: "alice",
        name: "Alice",
        mobile: null,
      },
      employments: "corrupt",
    },
  };
  expect(deriveDocumentLoginProfile(publication)).toEqual({ username: "alice", name: "Alice", mobile: null });
});
