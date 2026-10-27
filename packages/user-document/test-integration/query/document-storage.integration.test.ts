import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { UserStatus, UserType } from "@iam/contracts";
import { createInternalUserDocumentQueryRepository, createInternalUserDocumentQueryService } from "../../src";
import { createUserDocumentQueryRepository } from "../../src/query/user-document-query.repository";
import { createUserDocumentQueryService } from "../../src/query/user-document-query.service";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-test-harness";

let harness: PostgresTestHarness;
const subject = "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888";
const document = {
  subjectIdentifier: subject,
  username: "alice",
  name: "Published Alice",
  mobile: null,
  wxId: null,
  userType: UserType.Formal,
  status: UserStatus.Pause,
  employments: [],
};
beforeAll(async () => {
  harness = await createPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

test("directory and narrow login read the same published canonical document", async () => {
  await harness.sql`INSERT INTO user_document(user_id, subject_identifier, schema_version, source_version, published_at, document) VALUES (1, ${subject}, 1, 8, NOW(), ${JSON.stringify(document)}::jsonb)`;
  const detail = createInternalUserDocumentQueryService({
    documentRepository: createInternalUserDocumentQueryRepository(harness.db),
  });
  const narrow = createUserDocumentQueryService({ documentRepository: createUserDocumentQueryRepository(harness.db) });
  const result = await detail.getDetailByUsername("alice", "internal-only");
  const login = await narrow.getLoginProfileByUserId(1);
  expect(result).toEqual(document);
  expect(login).toEqual({ username: "alice", name: "Published Alice", mobile: null });
});
