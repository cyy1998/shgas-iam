import type { UserProfile } from "@iam/db/schema";
import { UserProfileDirtyReason, UserProfileDirtyStatus, UserStatus, UserType } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileQueryService } from "../user-profile-query.service";
import {
  compileLegacyUserQueryToProfileFilter,
  createUserProfileRepository,
} from "../user-profile.repository";
import { CURRENT_USER_PROFILE_SCHEMA_VERSION } from "../user-profile.schema";

const now = new Date("2026-06-30T08:00:00.000Z");

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 1,
    username: "zhangsan",
    mobile: "13800000000",
    wxId: "wx-1",
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
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
      orcasId: null,
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
    rebuiltAt: now,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

describe("UserProfileRepository", () => {
  test("filters identity reads to the current profile schema version", async () => {
    const findFirst = mock(async (_args?: unknown) => profile());
    const repository = createUserProfileRepository({
      query: {
        userProfiles: { findFirst },
      },
    } as any);

    await repository.getCurrentByUserId(1);

    expect((findFirst.mock.calls as unknown as Array<[unknown]>)[0]?.[0]).toEqual({
      where: {
        userId: 1,
        profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
      },
    });
  });
});

describe("UserProfileQueryService", () => {
  test("returns current-version profile details without fallback to source tables", async () => {
    const service = createUserProfileQueryService({
      profileRepository: {
        getCurrentByUserId: mock(async () => null),
      } as any,
    });

    await expect(service.getDetailByUserId(1)).rejects.toBeInstanceOf(UserNotFoundError);
  });

  test("compiles legacy employment filters into one nested employment filter", () => {
    expect(compileLegacyUserQueryToProfileFilter({
      positionCodes: ["P001"],
      roleCodes: ["role:a"],
      ancestorOrgCodes: ["SR"],
      ancestorOrgDepths: [0, 2],
    })).toEqual({
      nested: "employments",
      where: {
        all: [
          { field: "employment.position.code", op: "in", value: ["P001"] },
          { field: "employment.roles", op: "containsAny", value: ["role:a"] },
          { field: "employment.org.ancestorKeys", op: "containsAny", value: ["SR#0", "SR#2"] },
        ],
      },
    });
  });

  test("rejects employment DSL fields outside explicit nested employment filters", async () => {
    const service = createUserProfileQueryService({
      profileRepository: {
        searchCurrentVisibleProfiles: mock(async () => []),
      } as any,
    });

    await expect(service.searchDsl({
      field: "employment.roles",
      op: "containsAny",
      value: ["role:a"],
    })).rejects.toThrow("employment fields must be inside a nested employments filter");
  });

  test("validates dirty status and reason schemas used by profile DTOs", async () => {
    const schema = await import("../user-profile.schema");

    expect(schema.UserProfileDirtyStatusDtoSchema.parse(UserProfileDirtyStatus.Pending)).toBe(
      UserProfileDirtyStatus.Pending,
    );
    expect(schema.UserProfileDirtyReasonDtoSchema.parse(UserProfileDirtyReason.Backfill)).toBe(
      UserProfileDirtyReason.Backfill,
    );
  });
});
