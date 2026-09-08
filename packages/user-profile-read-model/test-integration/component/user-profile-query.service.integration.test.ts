import type { UserProfile } from "@iam/db/schema";
import type { UserProfileQueryRepositoryPort } from "../../src/query";
import type { UserProfileQueryRepository } from "../../src/query/user-profile-query.repository";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";
import {
  createUserProfileQueryService,
} from "../../src/query";
import { createUserProfileQueryRepository } from "../../src/query/user-profile-query.repository";
import { USER_PROFILE_SCHEMA_VERSION } from "../../src/schema/profile.schema";

const now = new Date("2026-06-30T08:00:00.000Z");

function assertAssignable<Port, _Provider extends Port>() {}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 1,
    subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    username: "zhangsan",
    name: "Zhang San",
    mobile: "13800000000",
    wxId: "wx-1",
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
    sourceDirtyVersion: "1",
    detail: {
      id: 1,
      username: "zhangsan",
      wxId: "wx-1",
      name: "Zhang San",
      mobile: "13800000000",
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: now,
      updateTime: now,
      employments: [],
      privileges: [],
      roles: [],
    } as unknown as UserProfile["detail"],
    searchDoc: {
      user: {
        id: 1,
        username: "zhangsan",
        name: "Zhang San",
        mobile: "13800000000",
        wxId: "wx-1",
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: now,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function orgNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    orgCode: "ORG",
    orgName: "Org",
    orgType: OrganizationType.Department,
    level: OrganizationLevel.One,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    pathIndex: 0,
    distanceToAssignedOrg: 0,
    ...overrides,
  };
}

function employmentDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    posId: 1000,
    orgId: 100,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    user: {
      id: 1,
      username: "zhangsan",
      name: "Zhang San",
      mobile: "13800000000",
      wxId: "wx-1",
    },
    position: {
      id: 1000,
      posCode: "P001",
      posName: "Position 1",
    },
    organization: {
      assignedOrg: orgNode(),
      fullOrgPath: [orgNode()],
      companyNodes: [],
    },
    privileges: ["privilege:a"],
    roles: ["role:a"],
    responsibilities: [],
    ...overrides,
  };
}

function jsonDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("UserProfileQueryRepository", () => {
  test("filters identity reads to the current profile schema version", async () => {
    const findFirst = mock(async (_args?: unknown) => profile());
    const repository = createUserProfileQueryRepository({
      query: {
        userProfiles: { findFirst },
      },
    } as any);

    await repository.getCurrentByUserId(1);

    expect(repository).not.toHaveProperty("upsertProfile");
    expect(repository).not.toHaveProperty("deleteByUserId");
    expect((findFirst.mock.calls as unknown as Array<[unknown]>)[0]?.[0]).toEqual({
      where: {
        userId: 1,
        profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
      },
    });
  });
});

describe("UserProfileQueryService", () => {
  test("the production repository satisfies the query-only read port", () => {
    assertAssignable<UserProfileQueryRepositoryPort, UserProfileQueryRepository>();
  });

  test("depends on a query-only read port", async () => {
    const currentProfile = profile();
    const queryRepository = {
      getCurrentByUserId: mock(async () => currentProfile),
      getCurrentByUsername: mock(async () => currentProfile),
      getCurrentByMobile: mock(async () => currentProfile),
      getCurrentByWxId: mock(async () => currentProfile),
    } satisfies UserProfileQueryRepositoryPort;
    const service = createUserProfileQueryService({
      profileRepository: queryRepository,
    });

    await expect(service.getDetailByUserId(1)).resolves.toMatchObject({
      id: 1,
      username: "zhangsan",
    });
  });

  test("returns current-version profile details without fallback to source tables", async () => {
    const service = createUserProfileQueryService({
      profileRepository: {
        getCurrentByUserId: mock(async () => null),
      } as any,
    });

    await expect(service.getDetailByUserId(1)).rejects.toBeInstanceOf(UserNotFoundError);
  });

  test("revives JSONB ISO date strings before parsing profile detail DTOs", async () => {
    const jsonDetail = jsonDocument({
      ...(profile().detail as Record<string, unknown>),
      employments: [employmentDetail()],
    });
    const jsonProfile = profile({ detail: jsonDetail as UserProfile["detail"] });
    const service = createUserProfileQueryService({
      profileRepository: {
        getCurrentByUserId: mock(async () => jsonProfile),
      } as any,
    });

    const detail = await service.getDetailByUserId(1);

    expect(detail.createTime).toBeInstanceOf(Date);
    expect(detail.updateTime).toBeInstanceOf(Date);
    expect(detail.employments[0]?.startTime).toBeInstanceOf(Date);
    expect(detail.employments[0]?.createTime).toBeInstanceOf(Date);
    expect(detail.employments[0]?.updateTime).toBeInstanceOf(Date);
  });

  test("rejects ORCAS Session Context mixed into an otherwise valid Detail", async () => {
    const malformed = profile({
      detail: jsonDocument({
        ...(profile().detail as Record<string, unknown>),
        employments: [employmentDetail()],
        orcasId: "orcas-session-context",
      }) as UserProfile["detail"],
    });
    const service = createUserProfileQueryService({
      profileRepository: {
        getCurrentByUserId: mock(async () => malformed),
        getCurrentByUsername: mock(async () => malformed),
        getCurrentByMobile: mock(async () => malformed),
        getCurrentByWxId: mock(async () => malformed),
      },
    });

    const error = await service.getDetailByUserId(1).catch(error => error);

    expect(error).toMatchObject({
      issues: [{ code: "unrecognized_keys", keys: ["orcasId"], path: [] }],
    });
  });

  test("rejects a legacy-shaped Detail from the strict current reader", async () => {
    const { responsibilities: _responsibilities, ...v1Employment } = employmentDetail();
    const malformed = profile({
      detail: {
        ...(profile().detail as Record<string, unknown>),
        employments: [v1Employment],
      } as UserProfile["detail"],
    });
    const service = createUserProfileQueryService({
      profileRepository: {
        getCurrentByUserId: mock(async () => malformed),
      } as any,
    });

    const error = await service.getDetailByUserId(1).catch(error => error);
    expect(error).toBeInstanceOf(Error);
  });
});
