import type { UserProfileBuildDataset } from "../user-profile-build.repository";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileBuilder } from "../user-profile-builder.service";
import { CURRENT_USER_PROFILE_SCHEMA_VERSION } from "../user-profile.schema";

const now = new Date("2026-06-30T08:00:00.000Z");

function base(id: number) {
  return {
    id,
    isDelete: false,
    createTime: now,
    updateTime: now,
  };
}

function user(id: number, overrides: Record<string, unknown> = {}) {
  return {
    ...base(id),
    oidcSubject: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
    username: `user${id}`,
    wxId: `wx-${id}`,
    name: `User ${id}`,
    password: null,
    mobile: `1380000000${id}`,
    userType: UserType.Formal,
    orderNum: id,
    status: UserStatus.Enable,
    ...overrides,
  };
}

function employment(id: number, userId: number, orgId: number, posId: number, isPrimary = false) {
  return {
    ...base(id),
    userId,
    orgId,
    posId,
    isPrimary,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
  };
}

function position(id: number) {
  return {
    ...base(id),
    posCode: `POS${id}`,
    posName: `Position ${id}`,
    status: PositionStatus.Enable,
    description: null,
  };
}

function orgPathRow(
  descendantId: number,
  id: number,
  orgCode: string,
  depth: number,
  orgType = OrganizationType.Department,
) {
  return {
    descendantId,
    depth,
    id,
    orgCode,
    orgName: `${orgCode} name`,
    orgType,
    level: OrganizationLevel.One,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
  };
}

describe("UserProfileBuilder", () => {
  test("builds detail and search documents from the batch dataset", async () => {
    const dataset: UserProfileBuildDataset = {
      users: [
        user(1),
        user(2, { status: UserStatus.Pause, isDelete: true }),
      ] as UserProfileBuildDataset["users"],
      employments: [
        employment(10, 1, 100, 1000, true),
        employment(11, 1, 200, 2000),
        employment(12, 1, 300, 3000),
      ] as UserProfileBuildDataset["employments"],
      positions: [
        position(1000),
        position(2000),
      ] as UserProfileBuildDataset["positions"],
      orgPathRows: [
        orgPathRow(100, 1, "COMP", 2, OrganizationType.Company),
        orgPathRow(100, 100, "DEPT", 0),
        orgPathRow(200, 2, "COMP2", 1, OrganizationType.Company),
        orgPathRow(200, 200, "TEAM", 0),
      ],
      roleRows: [
        { employmentId: 10, roleId: 1, roleCode: "position-role" },
        { employmentId: 10, roleId: 2, roleCode: "employment-role" },
        { employmentId: 10, roleId: 3, roleCode: "organization-role" },
        { employmentId: 11, roleId: 4, roleCode: "second-role" },
      ],
      privilegeRows: [
        { roleId: 1, privilegeCode: "priv:position" },
        { roleId: 2, privilegeCode: "priv:employment" },
        { roleId: 3, privilegeCode: "priv:organization" },
        { roleId: 4, privilegeCode: "priv:second" },
      ],
    };
    const builder = createUserProfileBuilder({
      buildRepository: {
        loadByUserIds: mock(async () => dataset),
      },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const profiles = await builder.buildMany([1, 2]);
    const activeProfile = profiles.find(item => item.userId === 1)!;
    const hiddenProfile = profiles.find(item => item.userId === 2)!;

    expect(activeProfile.profileSchemaVersion).toBe(CURRENT_USER_PROFILE_SCHEMA_VERSION);
    expect(activeProfile.rebuiltAt).toBe(now);
    expect(activeProfile.searchVisible).toBe(true);
    expect(activeProfile.detail).not.toHaveProperty("orcasId");
    expect(activeProfile.detail.employments).toHaveLength(2);
    expect(activeProfile.detail.employments[0]?.isPrimary).toBe(true);
    expect(activeProfile.detail.roles).toEqual([
      "position-role",
      "employment-role",
      "organization-role",
      "second-role",
    ]);
    expect(activeProfile.detail.privileges).toEqual([
      "priv:position",
      "priv:employment",
      "priv:organization",
      "priv:second",
    ]);
    expect(activeProfile.searchDoc.employments[0]).toMatchObject({
      org: {
        ancestorCodes: ["COMP", "DEPT"],
        ancestorDepths: [2, 0],
        ancestorKeys: ["COMP#2", "DEPT#0"],
        companyCodes: ["COMP"],
      },
      position: { code: "POS1000" },
      roles: ["position-role", "employment-role", "organization-role"],
      privileges: ["priv:position", "priv:employment", "priv:organization"],
      isPrimary: true,
    });
    expect(hiddenProfile.searchVisible).toBe(false);
  });
});
