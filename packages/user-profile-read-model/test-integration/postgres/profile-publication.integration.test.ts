import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PublishedProfileSchema } from "../../src/schema/profile.schema";
import { createCurrentUserProfileProjectionBundle } from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-20T12:00:00.000Z");
const subjectIdentifier = "c188a58a-5f25-43ad-82c7-82b54ff972c5";

describe("User Profile v3 PostgreSQL publication", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("atomically publishes all v3 documents and processes the same Dirty Version", async () => {
    await seedProcessingDirty("4");
    const publication = createCurrentUserProfileProjectionBundle().createPublicationRepository(harness.db);

    const publicationResult = await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: profile("4"),
      processedAt: now,
    });
    expect(publicationResult).toEqual({ status: "published" });

    const [row] = await harness.sql<{
      profileSchemaVersion: number;
      sourceDirtyVersion: string;
      detail: unknown;
      searchDoc: unknown;
      subjectFacts: unknown;
      dirtyStatus: UserProfileDirtyStatus;
    }[]>`
      SELECT
        p.profile_schema_version AS "profileSchemaVersion",
        p.source_dirty_version::text AS "sourceDirtyVersion",
        p.detail,
        p.search_doc AS "searchDoc",
        p.subject_facts AS "subjectFacts",
        d.status AS "dirtyStatus"
      FROM user_profile p
      JOIN user_profile_dirty d ON d.user_id = p.user_id
      WHERE p.user_id = 1
    `;
    expect(row).toEqual({
      profileSchemaVersion: 3,
      sourceDirtyVersion: "4",
      detail: jsonDocument(profile("4").detail),
      searchDoc: jsonDocument(profile("4").searchDoc),
      subjectFacts: jsonDocument(profile("4").subjectFacts),
      dirtyStatus: UserProfileDirtyStatus.Processed,
    });
  });

  test("keeps the previous profile when the Dirty transition rolls back", async () => {
    await harness.sql`
      INSERT INTO user_profile (
        user_id, subject_identifier, username, name, status, is_delete, search_visible,
        profile_schema_version, source_dirty_version, detail, search_doc, subject_facts, rebuilt_at
      ) VALUES (
        1, ${subjectIdentifier}, 'previous', 'Previous', ${UserStatus.Enable}, false, true,
        1, 3, ${JSON.stringify({ marker: "previous-detail" })}::jsonb,
        ${JSON.stringify({ marker: "previous-search" })}::jsonb,
        ${JSON.stringify({ employments: [] })}::jsonb, ${now.toISOString()}
      )
    `;
    await seedProcessingDirty("4");
    await harness.sql.unsafe(`
      CREATE FUNCTION reject_v3_processed_dirty() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'processed' THEN
          RAISE EXCEPTION 'forced v3 dirty failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await harness.sql.unsafe(`
      CREATE TRIGGER reject_v3_processed_dirty_trigger
      BEFORE UPDATE ON user_profile_dirty
      FOR EACH ROW EXECUTE FUNCTION reject_v3_processed_dirty()
    `);

    try {
      const publication = createCurrentUserProfileProjectionBundle().createPublicationRepository(harness.db);
      let failure: unknown;
      try {
        await publication.publishCandidate({
          userId: 1,
          dirtyVersion: "4",
          profile: profile("4"),
          processedAt: now,
        });
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeDefined();
      const [preserved] = await harness.sql<{
        username: string;
        profileSchemaVersion: number;
        sourceDirtyVersion: string;
      }[]>`
        SELECT username, profile_schema_version AS "profileSchemaVersion",
               source_dirty_version::text AS "sourceDirtyVersion"
        FROM user_profile WHERE user_id = 1
      `;
      expect(preserved).toEqual({
        username: "previous",
        profileSchemaVersion: 1,
        sourceDirtyVersion: "3",
      });
    }
    finally {
      await harness.sql.unsafe("DROP TRIGGER reject_v3_processed_dirty_trigger ON user_profile_dirty");
      await harness.sql.unsafe("DROP FUNCTION reject_v3_processed_dirty()");
    }
  });

  async function seedProcessingDirty(version: string) {
    await harness.sql`
      INSERT INTO user_profile_dirty (
        user_id, dirty_version, status, reason_codes, dirty_at, processing_started_at
      ) VALUES (
        1, ${version}, ${UserProfileDirtyStatus.Processing},
        ${JSON.stringify([UserProfileDirtyReason.OrganizationResponsibilityAssignmentUpdated])}::jsonb,
        ${now.toISOString()}, ${now.toISOString()}
      )
    `;
  }
});

function profile(sourceDirtyVersion: string) {
  return PublishedProfileSchema.parse({
    userId: 1,
    subjectIdentifier,
    username: "user1",
    name: "User 1",
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 3,
    sourceDirtyVersion,
    detail: {
      id: 1,
      username: "user1",
      name: "User 1",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: now,
      updateTime: now,
      employments: [],
      privileges: [],
      roles: [],
    },
    searchDoc: {
      user: {
        subjectIdentifier,
        username: "user1",
        name: "User 1",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: now,
  });
}

function jsonDocument(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
