import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
  UserStatus,
} from "@iam/contracts";
import { userDocuments } from "@iam/db/schema";
import { publication } from "../../src/__tests__/document-fixture";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../../src/index";
import { createSubjectFactsReader } from "../../src/subject-facts";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

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
    if (harness) await harness.close();
  });

  test("rejects a published V1 row without fallback or cache publication", async () => {
    await seedLegacyPublishedSubject(harness, "21");
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
    await seedPublishedSubject(harness, "22");
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: harness.db,
      cache: {
        read: mock(async () => null),
        publish,
      },
    });

    const facts = await reader.read(SUBJECT_IDENTIFIER);

    expect(facts?.employments[0]?.responsibilities).toEqual([
      {
        type: {
          code: OrganizationResponsibilityTypeCode.Head,
          name: "负责人",
        },
        targetOrganization: {
          code: "target-a",
          name: "目标甲",
          type: OrganizationType.Department,
          path: [
            { level: 1, distanceToTarget: 0, code: "target-a", name: "目标甲", type: OrganizationType.Department },
          ],
        },
      },
    ]);
    expect(facts?.sourceVersion).toBe("22");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test.each([
    UserDocumentWorkStatus.Pending,
    UserDocumentWorkStatus.Processing,
    UserDocumentWorkStatus.Failed,
    UserDocumentWorkStatus.Processed,
    null,
  ])("delivers published authorization from PostgreSQL and cache while Dirty is %s", async (status) => {
    await seedPublishedSubject(harness, "22");
    if (status === null) {
      await harness.sql`DELETE FROM user_document_rebuild_state WHERE user_id = 1`;
    } else {
      await harness.sql`UPDATE user_document_rebuild_state SET version = 23, status = ${status},
        processing_token = CASE WHEN ${status} = 'processing' THEN gen_random_uuid() ELSE NULL END,
        processing_started_at = CASE WHEN ${status} = 'processing' THEN NOW() ELSE NULL END WHERE user_id = 1`;
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
        if (value !== permission) throw new Error("permission required");
      },
    });
    const input = {
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: { catalogVersion: 3, optionalClaims: ["profile:name", "iam:authorization"] },
    } as const;
    const fromDatabase = await projection.resolve(input, permission);
    const fromCache = await projection.resolve(input, permission);
    expect(fromDatabase).toMatchObject({
      name: "Alice",
      authorization: { roles: ["operator"] },
    });
    expect(fromCache).toEqual(fromDatabase);
  });
});

async function seedLegacyPublishedSubject(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  version: string,
) {
  await harness.db.insert(userDocuments).values({
    ...publication(1, version),
    subjectIdentifier: SUBJECT_IDENTIFIER,
    schemaVersion: 0,
    document: { legacy: true },
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
      ${version},
      ${UserDocumentWorkStatus.Processed},
      ${JSON.stringify([UserDocumentRebuildReason.UserUpdated])}::jsonb,
      ${REBUILT_AT.toISOString()},
      ${REBUILT_AT.toISOString()}
    )
  `;
}

async function seedPublishedSubject(harness: Awaited<ReturnType<typeof createPostgresTestHarness>>, version: string) {
  const responsibilities = [
    {
      type: {
        code: OrganizationResponsibilityTypeCode.Head,
        name: "负责人",
      },
      targetOrganization: {
        code: "target-a",
        name: "目标甲",
        type: OrganizationType.Department,
        path: [{ level: 1, distanceToTarget: 0, code: "target-a", name: "目标甲", type: OrganizationType.Department }],
      },
    },
  ];
  const subjectFacts = {
    employments: [
      {
        isPrimary: true,
        organization: {
          code: "org-a",
          name: "甲部门",
          type: OrganizationType.Department,
          path: [{ level: 1, distanceToTarget: 0, code: "org-a", name: "甲部门", type: OrganizationType.Department }],
        },
        position: { code: "position-a", name: "甲岗位" },
        clientAuthorizations: [{ clientCode: "console", roles: [{ code: "operator" }] }],
        responsibilities,
      },
    ],
  };
  const base = publication(1, version);
  await harness.db.insert(userDocuments).values({
    ...base,
    subjectIdentifier: SUBJECT_IDENTIFIER,
    publishedAt: REBUILT_AT,
    document: {
      user: { ...base.document.user, subjectIdentifier: SUBJECT_IDENTIFIER, username: "alice", name: "Alice" },
      employments: subjectFacts.employments,
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
      ${version},
      ${UserDocumentWorkStatus.Processed},
      ${JSON.stringify([UserDocumentRebuildReason.UserUpdated])}::jsonb,
      ${REBUILT_AT.toISOString()},
      ${REBUILT_AT.toISOString()}
    )
  `;
}
