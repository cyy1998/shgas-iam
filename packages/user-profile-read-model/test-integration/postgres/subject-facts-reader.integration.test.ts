import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createSubjectFactsReader } from "../../src/subject-facts";
import { V3_USER_PROFILE_SCHEMA_VERSION } from "../../src/v3";
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

  test("rejects a published V1 row without fallback or cache publication", async () => {
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

    expect(facts).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  test("reads one strict v3 responsibility row and publishes its recorded version", async () => {
    await seedPublishedSubjectV3(harness, "22");
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: harness.db,
      cache: {
        read: mock(async () => null),
        publish,
      },
    });

    const facts = await reader.read(SUBJECT_IDENTIFIER);

    expect(facts?.employments[0]?.responsibilities).toEqual([{
      type: {
        code: OrganizationResponsibilityTypeCode.Head,
        name: "负责人",
      },
      targetOrganization: {
        code: "target-a",
        name: "目标甲",
        type: OrganizationType.Department,
        path: [{
          code: "target-a",
          name: "目标甲",
          type: OrganizationType.Department,
        }],
      },
    }]);
    expect(facts?.sourceDirtyVersion).toBe("22");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test.each([
    UserProfileDirtyStatus.Pending,
    UserProfileDirtyStatus.Processing,
    UserProfileDirtyStatus.Failed,
    UserProfileDirtyStatus.Processed,
    null,
  ])("delivers published authorization from PostgreSQL and cache while Dirty is %s", async (status) => {
    await seedPublishedSubjectV3(harness, "22");
    if (status === null) {
      await harness.sql`DELETE FROM user_profile_dirty WHERE user_id = 1`;
    }
    else {
      await harness.sql`UPDATE user_profile_dirty SET dirty_version = 23, status = ${status} WHERE user_id = 1`;
    }
    let cached: string | null = null;
    const reader = createSubjectFactsReader({
      db: harness.db,
      cache: {
        read: async () => cached,
        publish: async (record) => {
          cached = JSON.stringify(record);
          return { status: "published" };
        },
      },
    });
    const permission = {};
    const projection = createPermittedClientSubjectProjectionService({
      subjectFacts: reader,
      assertPermission(value: object) {
        if (value !== permission)
          throw new Error("permission required");
      },
    });
    const input = {
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: { catalogVersion: 2, optionalClaims: ["profile:name", "iam:authorization"] },
    } as const;
    const fromDatabase = await projection.resolve(input, permission);
    const fromCache = await projection.resolve(input, permission);
    expect(fromDatabase).toMatchObject({
      name: "Alice",
      authorization: { roles: ["operator"], privileges: ["approve"] },
    });
    expect(fromCache).toEqual(fromDatabase);
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

async function seedPublishedSubjectV3(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  dirtyVersion: string,
) {
  const responsibilities = [{
    type: {
      code: OrganizationResponsibilityTypeCode.Head,
      name: "负责人",
    },
    targetOrganization: {
      code: "target-a",
      name: "目标甲",
      type: OrganizationType.Department,
      path: [{
        code: "target-a",
        name: "目标甲",
        type: OrganizationType.Department,
      }],
    },
  }];
  const subjectFacts = {
    employments: [{
      isPrimary: true,
      organization: {
        code: "org-a",
        name: "甲部门",
        type: OrganizationType.Department,
        path: [{
          code: "org-a",
          name: "甲部门",
          type: OrganizationType.Department,
        }],
      },
      position: { code: "position-a", name: "甲岗位" },
      clientAuthorizations: [{ clientCode: "console", roles: [{ code: "operator", privileges: ["approve"] }] }],
      responsibilities,
    }],
  };
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
      ${V3_USER_PROFILE_SCHEMA_VERSION},
      ${dirtyVersion},
      ${JSON.stringify({ candidate: true })}::jsonb,
      ${JSON.stringify({ candidate: true })}::jsonb,
      ${JSON.stringify(subjectFacts)}::jsonb,
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
