import type {
  SubjectFactsCacheRecord,
} from "../../src/subject-facts";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectFactsReader,
} from "../../src/subject-facts";

const SUBJECT_IDENTIFIER = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Facts V2 Reader", () => {
  test("uses one strict V2 cached record without querying PostgreSQL", async () => {
    const select = mock(() => {
      throw new Error("a V2 cache hit must not query PostgreSQL");
    });
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("7"))),
        publish,
      },
    });

    await expect(reader.read(SUBJECT_IDENTIFIER)).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "7",
      profile: {
        username: "alice",
        name: "Alice",
        phone: "13800138000",
      },
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
        clientAuthorizations: [],
        responsibilities: [{
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
        }],
      }],
    });
    expect(select).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  test("rejects a V1 cache record and read-through publishes only a strict V2 profile row", async () => {
    const record = cacheRecord("8");
    const limit = mock(async () => [{
      subjectIdentifier: record.subjectIdentifier,
      username: record.profile.username,
      name: record.profile.name,
      mobile: record.profile.phone,
      profileSchemaVersion: 2,
      sourceDirtyVersion: record.sourceDirtyVersion,
      subjectFacts: record.facts,
      rebuiltAt: new Date(record.publishedAt),
    }]);
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({ limit }),
          }),
        }),
      } as never,
      cache: {
        read: mock(async () => JSON.stringify({
          ...record,
          schemaVersion: 1,
        })),
        publish,
      },
    });

    await expect(reader.read(SUBJECT_IDENTIFIER)).resolves.toMatchObject({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "8",
      employments: [{
        responsibilities: [{
          type: { code: OrganizationResponsibilityTypeCode.Head },
        }],
      }],
    });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(record);
  });

  test("fails closed instead of publishing a malformed V2 responsibility", async () => {
    const record = cacheRecord("9");
    const malformedFacts = structuredClone(record.facts);
    Reflect.set(
      malformedFacts.employments[0]!.responsibilities[0]!.type,
      "unknown",
      true,
    );
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: mock(async () => [{
                subjectIdentifier: record.subjectIdentifier,
                username: record.profile.username,
                name: record.profile.name,
                mobile: record.profile.phone,
                profileSchemaVersion: 2,
                sourceDirtyVersion: record.sourceDirtyVersion,
                subjectFacts: malformedFacts,
                rebuiltAt: new Date(record.publishedAt),
              }]),
            }),
          }),
        }),
      } as never,
      cache: {
        read: mock(async () => null),
        publish,
      },
    });

    await expect(reader.read(SUBJECT_IDENTIFIER)).resolves.toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });
});

function cacheRecord(
  sourceDirtyVersion: string,
): SubjectFactsCacheRecord {
  return {
    schemaVersion: 2,
    sourceDirtyVersion,
    publishedAt: "2026-07-25T10:00:00.000Z",
    subjectIdentifier: SUBJECT_IDENTIFIER,
    profile: {
      username: "alice",
      name: "Alice",
      phone: "13800138000",
    },
    facts: {
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
        clientAuthorizations: [],
        responsibilities: [{
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
        }],
      }],
    },
  };
}
