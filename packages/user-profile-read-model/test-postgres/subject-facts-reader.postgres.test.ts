import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createSubjectFactsReader } from "../src/subject-facts";
import { createPostgresTestHarness } from "./postgres-test-harness";

const SUBJECT_IDENTIFIER = "62b1eede-a7a5-4b6a-a716-54e3314f790f";
const REBUILT_AT = new Date("2026-07-31T10:00:00.000Z");

describe("Subject Facts PostgreSQL reader", () => {
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

  test("reads one published row and verifies its processed Dirty version by Subject Identifier", async () => {
    await seedPublishedSubject(harness, "21");
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: harness.db,
      cache: {
        read: mock(async () => null),
        publish,
      },
    });

    const facts = await reader.read(SUBJECT_IDENTIFIER);

    expect(facts).toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "21",
      profile: {
        username: "alice",
        name: "Alice",
        phone: null,
      },
      employments: [],
    });
    expect(await reader.check({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "21",
    })).toEqual({ status: "fresh" });
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

async function seedPublishedSubject(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  dirtyVersion: string,
) {
  await harness.sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      username,
      name,
      mobile,
      wx_id,
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
      NULL,
      NULL,
      ${UserStatus.Enable},
      FALSE,
      TRUE,
      1,
      ${dirtyVersion},
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
      ${dirtyVersion},
      ${UserProfileDirtyStatus.Processed},
      ${JSON.stringify([UserProfileDirtyReason.UserUpdated])}::jsonb,
      ${REBUILT_AT.toISOString()},
      ${REBUILT_AT.toISOString()}
    )
  `;
}
