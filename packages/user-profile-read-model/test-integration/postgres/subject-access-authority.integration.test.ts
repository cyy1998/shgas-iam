import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createSubjectAccessAuthorityRepository } from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

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
    if (harness)
      await harness.close();
  });

  test("reports enabled/current only after publishing the matching processed Facts version", async () => {
    await seedUser(harness, {
      status: UserStatus.Enable,
      isDelete: false,
    });
    await seedProfileAndDirty(harness, UserProfileDirtyStatus.Processed);
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
    await seedProfileAndDirty(harness, UserProfileDirtyStatus.Pending);
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
  dirtyStatus: UserProfileDirtyStatus,
) {
  await harness.sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      username,
      name,
      status,
      is_delete,
      search_visible,
      profile_schema_version,
      source_dirty_version,
      detail,
      search_doc,
      subject_facts,
      rebuilt_at
    )
    VALUES (
      1,
      ${SUBJECT_IDENTIFIER},
      'alice',
      'Alice',
      ${UserStatus.Enable},
      FALSE,
      TRUE,
      2,
      7,
      ${JSON.stringify({ legacyOnly: "must-not-be-read" })}::jsonb,
      ${JSON.stringify({ legacySearchOnly: "must-not-be-read" })}::jsonb,
      ${JSON.stringify({ employments: [] })}::jsonb,
      ${REBUILT_AT.toISOString()}
    )
  `;
  await harness.sql`
    INSERT INTO user_profile_dirty (
      user_id,
      dirty_version,
      status,
      reason_codes,
      dirty_at,
      processed_at
    )
    VALUES (
      1,
      7,
      ${dirtyStatus},
      ${JSON.stringify([UserProfileDirtyReason.UserUpdated])}::jsonb,
      ${REBUILT_AT.toISOString()},
      ${dirtyStatus === UserProfileDirtyStatus.Processed
        ? REBUILT_AT.toISOString()
        : null}
    )
  `;
}
