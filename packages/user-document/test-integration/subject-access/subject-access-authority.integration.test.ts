import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { UserDocumentRebuildReason, UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import { userDocuments } from "@iam/db/schema";
import { publication } from "../../src/__tests__/document-fixture";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../../src/index";
import { createSubjectAccessAuthorityRepository } from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const SUBJECT_IDENTIFIER = "e84250ac-69ec-4a6e-aa10-84cb1dc43ebb";
const REBUILT_AT = new Date("2026-07-31T10:00:00.000Z");

describe("Subject Access PostgreSQL authority", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  test("reports enabled/current only after publishing the matching processed Facts version", async () => {
    await seedUser(harness, {
      status: UserStatus.Enable,
      isDelete: false,
    });
    await seedProfileAndDirty(harness, UserDocumentWorkStatus.Processed);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db: harness.db,
      subjectFactsPublisher: { publish },
    });

    expect(await authority.resolve(SUBJECT_IDENTIFIER)).toEqual({
      accountState: "enabled",
      factsState: "current",
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test("keeps an enabled account not-current while its Dirty version is pending", async () => {
    await seedUser(harness, {
      status: UserStatus.Enable,
      isDelete: false,
    });
    await seedProfileAndDirty(harness, UserDocumentWorkStatus.Pending);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db: harness.db,
      subjectFactsPublisher: { publish },
    });

    expect(await authority.resolve(SUBJECT_IDENTIFIER)).toEqual({
      accountState: "enabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test.each([
    ["disabled", UserStatus.Disable, false],
    ["deleted", UserStatus.Enable, true],
  ])("uses the user table as authority for a %s account", async (_, status, isDelete) => {
    await seedUser(harness, { status, isDelete });
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db: harness.db,
      subjectFactsPublisher: { publish },
    });

    expect(await authority.resolve(SUBJECT_IDENTIFIER)).toEqual({
      accountState: "disabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });
});

async function seedUser(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  input: { status: UserStatus; isDelete: boolean },
) {
  await harness.sql`
    INSERT INTO "user" (
      id,
      subject_identifier,
      username,
      name,
      status,
      is_delete
    )
    VALUES (
      1,
      ${SUBJECT_IDENTIFIER},
      'alice',
      'Alice',
      ${input.status},
      ${input.isDelete}
    )
  `;
}

async function seedProfileAndDirty(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  dirtyStatus: UserDocumentWorkStatus,
) {
  const base = publication(1, "7");
  await harness.db.insert(userDocuments).values({
    ...base,
    subjectIdentifier: SUBJECT_IDENTIFIER,
    document: {
      ...base.document,
      user: { ...base.document.user, subjectIdentifier: SUBJECT_IDENTIFIER, username: "alice", name: "Alice" },
    },
  });
  await harness.sql`
    INSERT INTO user_document_rebuild_state (
      user_id,
      version,
      status,
      reason_codes,
      dirty_at,
      processed_at
    )
    VALUES (
      1,
      7,
      ${dirtyStatus},
      ${JSON.stringify([UserDocumentRebuildReason.UserUpdated])}::jsonb,
      ${REBUILT_AT.toISOString()},
      ${dirtyStatus === UserDocumentWorkStatus.Processed ? REBUILT_AT.toISOString() : null}
    )
  `;
}
