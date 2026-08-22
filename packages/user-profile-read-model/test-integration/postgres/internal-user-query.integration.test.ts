import type { EmploymentResponsibilitySnapshot } from "../../src/profile.schema";
import type { PostgresTestHarness } from "./postgres-test-harness";
import {
  ApiErrorCode,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { userProfiles } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createInternalUserProfileQueryRepository,
} from "../../src/internal-user-query.repository";
import {
  createInternalUserProfileQueryService,
} from "../../src/internal-user-query.service";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-20T12:00:00.000Z");
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("Internal User Profile query", () => {
  test("preserves User, Employment, and Responsibility scope identity", async () => {
    const headA = responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    );
    const supervisingB = responsibility(
      OrganizationResponsibilityTypeCode.Supervising,
      "TARGET-B",
    );
    await harness!.db.insert(userProfiles).values([
      profile(1, [[headA, supervisingB]]),
      profile(2, [[headA]]),
      profile(3, [[headA], [supervisingB]]),
    ]);
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const sameEmployment = await service.searchDsl({
      filter: {
        nested: "employments",
        where: {
          all: [
            {
              nested: "responsibilities",
              where: {
                all: [
                  {
                    field: "responsibility.type.code",
                    op: "eq",
                    value: OrganizationResponsibilityTypeCode.Head,
                  },
                  {
                    field: "responsibility.targetOrganization.code",
                    op: "withinSubtreeOf",
                    value: "TARGET-A",
                  },
                ],
              },
            },
            {
              nested: "responsibilities",
              where: {
                all: [
                  {
                    field: "responsibility.type.code",
                    op: "eq",
                    value: OrganizationResponsibilityTypeCode.Supervising,
                  },
                  {
                    field: "responsibility.targetOrganization.code",
                    op: "eq",
                    value: "TARGET-B",
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const differentEmployments = await service.searchDsl({
      filter: {
        all: [
          employmentWithType(OrganizationResponsibilityTypeCode.Head),
          employmentWithType(OrganizationResponsibilityTypeCode.Supervising),
        ],
      },
    });

    expect(sameEmployment.map(user => user.id)).toEqual([1]);
    expect(differentEmployments.map(user => user.id)).toEqual([1, 3]);
  });

  test("supports recursive negation and the complete responsibility operator whitelist", async () => {
    const headA = responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    );
    const supervisingB = responsibility(
      OrganizationResponsibilityTypeCode.Supervising,
      "TARGET-B",
    );
    await harness!.db.insert(userProfiles).values([
      profile(1, [[headA, supervisingB]]),
      profile(2, [[headA]]),
      profile(3, [[headA], [supervisingB]]),
    ]);
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const supervisingDepartment = await service.searchDsl({
      filter: {
        any: [
          {
            nested: "employments",
            where: {
              nested: "responsibilities",
              where: {
                all: [
                  {
                    field: "responsibility.type.code",
                    op: "in",
                    value: [OrganizationResponsibilityTypeCode.Supervising],
                  },
                  {
                    field: "responsibility.targetOrganization.code",
                    op: "in",
                    value: ["TARGET-B"],
                  },
                  {
                    field: "responsibility.targetOrganization.type",
                    op: "in",
                    value: [OrganizationType.Department],
                  },
                ],
              },
            },
          },
          {
            not: {
              nested: "employments",
              where: {
                nested: "responsibilities",
                where: {
                  field: "responsibility.targetOrganization.code",
                  op: "eq",
                  value: "TARGET-A",
                },
              },
            },
          },
        ],
      },
    });
    const withoutSupervising = await service.searchDsl({
      filter: {
        not: employmentWithType(OrganizationResponsibilityTypeCode.Supervising),
      },
    });
    const noMatch = await service.searchDsl({
      filter: {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.targetOrganization.code",
            op: "eq",
            value: "NO-MATCH",
          },
        },
      },
    });

    expect(supervisingDepartment.map(user => user.id)).toEqual([1, 3]);
    expect(withoutSupervising.map(user => user.id)).toEqual([2]);
    expect(noMatch).toEqual([]);
  });

  test("reads strict V2 Detail by identity", async () => {
    const headA = responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    );
    await harness!.db.insert(userProfiles).values([
      profile(1, [[headA]]),
      { ...profile(2, [[headA]]), profileSchemaVersion: 1 },
    ]);
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const detail = await service.getDetailByUsername("user-1");

    expect(detail.employments[0]?.responsibilities).toEqual([headA]);
  });

  test("does not fall back to a V1 Detail row", async () => {
    const headA = responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    );
    await harness!.db.insert(userProfiles).values({
      ...profile(2, [[headA]]),
      profileSchemaVersion: 1,
    });
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const error = await service.getDetailByUsername("user-2").catch(error => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.UserNotFound,
      httpStatus: 404,
    });
  });

  test("rejects 501 matching users without parsing or returning a partial result", async () => {
    const headA = responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    );
    await harness!.db.insert(userProfiles).values(
      Array.from({ length: 501 }, (_, index) => profile(index + 1, [[headA]])),
    );
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const error = await service.searchDsl({
      filter: employmentWithType(OrganizationResponsibilityTypeCode.Head),
    }).catch(error => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchResultTooLarge,
      httpStatus: 422,
    });
  }, 15_000);

  test("fails the whole query when a matched persisted V2 Detail is malformed", async () => {
    const malformed = profile(1, [[responsibility(
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    )]]);
    malformed.detail = { leakedValue: "SECRET-PERSISTED-DTO" } as never;
    await harness!.db.insert(userProfiles).values(malformed);
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const error = await service.searchDsl({
      filter: employmentWithType(OrganizationResponsibilityTypeCode.Head),
    }).catch(error => error);

    expect(error).toMatchObject({
      name: "InternalUserProfileDetailIntegrityError",
    });
  });
});

function employmentWithType(typeCode: OrganizationResponsibilityTypeCode) {
  return {
    nested: "employments" as const,
    where: {
      nested: "responsibilities" as const,
      where: {
        field: "responsibility.type.code" as const,
        op: "eq" as const,
        value: typeCode,
      },
    },
  };
}

function responsibility(
  typeCode: OrganizationResponsibilityTypeCode,
  targetCode: string,
): EmploymentResponsibilitySnapshot {
  return {
    type: {
      code: typeCode,
      name: typeCode === OrganizationResponsibilityTypeCode.Head ? "负责人" : "分管领导",
    },
    targetOrganization: {
      code: targetCode,
      name: targetCode,
      type: OrganizationType.Department,
      path: [
        { code: "TARGET-ROOT", name: "Target Root", type: OrganizationType.Company },
        { code: targetCode, name: targetCode, type: OrganizationType.Department },
      ],
    },
  };
}

function profile(
  userId: number,
  responsibilitiesByEmployment: EmploymentResponsibilitySnapshot[][],
) {
  const username = `user-${userId}`;
  const employments = responsibilitiesByEmployment.map((responsibilities, index) =>
    employmentDetail(userId, userId * 10 + index, responsibilities));
  return {
    userId,
    subjectIdentifier: `00000000-0000-4000-8000-${userId.toString().padStart(12, "0")}`,
    username,
    name: username,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 2,
    sourceDirtyVersion: "1",
    detail: {
      id: userId,
      username,
      wxId: null,
      name: username,
      mobile: null,
      userType: UserType.Formal,
      orderNum: userId,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: now,
      updateTime: now,
      employments,
      privileges: [],
      roles: [],
    },
    searchDoc: {
      user: {
        id: userId,
        username,
        name: username,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: employments.map(item => ({
        id: item.id,
        org: {
          id: item.orgId,
          code: item.organization.assignedOrg.orgCode,
          ancestorCodes: [],
          ancestorDepths: [],
          ancestorKeys: [],
          companyCodes: [],
        },
        position: { id: item.posId, code: item.position.posCode },
        roles: [],
        privileges: [],
        isPrimary: item.isPrimary,
        responsibilities: item.responsibilities,
      })),
    },
    subjectFacts: {
      employments: [],
    },
    rebuiltAt: now,
  };
}

function employmentDetail(
  userId: number,
  employmentId: number,
  responsibilities: EmploymentResponsibilitySnapshot[],
) {
  const orgId = employmentId + 100;
  const posId = employmentId + 1_000;
  const org = {
    id: orgId,
    orgCode: `ORG-${orgId}`,
    orgName: `Org ${orgId}`,
    orgType: OrganizationType.Department,
    level: OrganizationLevel.One,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    pathIndex: 0,
    distanceToAssignedOrg: 0,
  };
  return {
    id: employmentId,
    userId,
    posId,
    orgId,
    isPrimary: employmentId % 10 === 0,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    user: {
      id: userId,
      username: `user-${userId}`,
      name: `user-${userId}`,
      mobile: null,
      wxId: null,
    },
    position: {
      id: posId,
      posCode: `POS-${posId}`,
      posName: `Position ${posId}`,
    },
    organization: {
      assignedOrg: org,
      fullOrgPath: [org],
      companyNodes: [],
    },
    privileges: [],
    roles: [],
    responsibilities,
  };
}
