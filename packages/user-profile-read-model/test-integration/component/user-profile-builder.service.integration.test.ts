import type { UserProfileBuildDataset } from "../../src/user-profile-build.repository";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import {
  createUserProfileBuilder,
  UserProfileEmploymentIntegrityError,
} from "../../src/user-profile-builder.service";
import { LEGACY_USER_PROFILE_SCHEMA_VERSION } from "../../src/user-profile.schema";

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
    subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
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

function employment(
  id: number,
  userId: number,
  orgId: number,
  posId: number,
  isPrimary = false,
  overrides: Record<string, unknown> = {},
) {
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
    ...overrides,
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
  overrides: Record<string, unknown> = {},
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
    status: 1,
    isDelete: false,
    ...overrides,
  };
}

describe("UserProfileBuilder", () => {
  test("binds the published identity fields to the requested Dirty Version", async () => {
    const dataset = {
      users: [user(1)],
      employments: [],
      positions: [],
      orgPathRows: [],
      roleRows: [],
      privilegeRows: [],
    } as UserProfileBuildDataset;
    const builder = createUserProfileBuilder({
      buildRepository: {
        loadByUserIds: mock(async () => dataset),
      },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const profile = await builder.buildOne({
      userId: 1,
      sourceDirtyVersion: "9",
    });

    expect(profile).toMatchObject({
      userId: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "user1",
      name: "User 1",
      sourceDirtyVersion: "9",
      subjectFacts: { employments: [] },
    });
  });

  test("publishes only Enable employments inside the half-open Employment Period", async () => {
    const dataset = {
      users: [user(1, { status: UserStatus.Disable })],
      employments: [
        employment(10, 1, 100, 1000, true),
        employment(11, 1, 110, 1100, false, {
          startTime: new Date("2026-06-30T08:00:00.001Z"),
        }),
        employment(12, 1, 120, 1200, false, {
          startTime: new Date("2026-06-30T07:00:00.000Z"),
          endTime: now,
        }),
        employment(13, 1, 130, 1300, false, { status: EmploymentStatus.Pause }),
        employment(14, 1, 140, 1400, false, { status: EmploymentStatus.Disable }),
        employment(15, 1, 150, 1500, false, { isDelete: true }),
      ],
      positions: [
        position(1000),
        position(1100),
        position(1200),
        position(1300),
        position(1400),
        position(1500),
      ],
      orgPathRows: [
        orgPathRow(100, 100, "VALID", 0),
        orgPathRow(110, 110, "FUTURE", 0),
        orgPathRow(120, 120, "END-BOUNDARY", 0),
        orgPathRow(130, 130, "PAUSED", 0),
        orgPathRow(140, 140, "ENDED", 0),
        orgPathRow(150, 150, "TOMBSTONE", 0),
      ],
      roleRows: [],
      privilegeRows: [],
    } as unknown as UserProfileBuildDataset;
    const builder = createUserProfileBuilder({
      buildRepository: {
        loadByUserIds: mock(async () => dataset),
      },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const profile = await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" });

    expect(profile?.subjectFacts).toEqual({
      employments: [{
        isPrimary: true,
        organization: {
          code: "VALID",
          name: "VALID name",
          type: "部门",
          path: [{ code: "VALID", name: "VALID name", type: "部门" }],
        },
        position: { code: "POS1000", name: "Position 1000" },
        clientAuthorizations: [],
      }],
    });
    expect(profile?.detail.employments.map(item => item.id)).toEqual([10, 11, 12]);
    expect(profile?.searchDoc.employments.map(item => item.id)).toEqual([10, 11, 12]);
  });

  test.each([
    {
      name: "Enable Employment references an inactive Position",
      employment: employment(10, 1, 100, 1000),
      positions: [{ ...position(1000), isDelete: true }],
      orgPathRows: [orgPathRow(100, 100, "ORG", 0)],
      reason: "position-not-effective",
    },
    {
      name: "Pause Employment references an inactive Organization",
      employment: employment(11, 1, 110, 1100, false, { status: EmploymentStatus.Pause }),
      positions: [position(1100)],
      orgPathRows: [orgPathRow(110, 110, "ORG", 0, OrganizationType.Department, {
        status: OrganizationStatus.Disable,
      })],
      reason: "organization-not-effective",
    },
  ])("fails the whole build when $name", async ({ employment: employmentRow, positions, orgPathRows, reason }) => {
    const builder = createUserProfileBuilder({
      buildRepository: {
        loadByUserIds: mock(async () => ({
          users: [user(1)],
          employments: [employmentRow],
          positions,
          orgPathRows,
          roleRows: [],
          privilegeRows: [],
        } as unknown as UserProfileBuildDataset)),
      },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const buildError = await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" }).catch(error => error);

    expect(buildError).toBeInstanceOf(UserProfileEmploymentIntegrityError);
    expect(buildError).toMatchObject({
      name: "UserProfileEmploymentIntegrityError",
      code: "USER_PROFILE_EMPLOYMENT_INTEGRITY_FAILED",
      reason,
      userId: 1,
      employmentId: employmentRow.id,
    });
  });

  test("publishes minimal client-scoped Subject Facts in deterministic order", async () => {
    const dataset = {
      users: [user(1)],
      employments: [
        employment(11, 1, 200, 2000),
        employment(10, 1, 100, 1000, true),
      ],
      positions: [
        position(2000),
        position(1000),
      ],
      orgPathRows: [
        orgPathRow(200, 200, "TEAM", 0),
        orgPathRow(100, 100, "DEPT", 0),
        orgPathRow(100, 1, "ROOT", 1, OrganizationType.Company),
        orgPathRow(200, 2, "BRANCH", 1, OrganizationType.Company),
      ],
      roleRows: [
        { employmentId: 10, roleId: 8, roleCode: "role-z", clientCode: "client-b" },
        { employmentId: 10, roleId: 7, roleCode: "role-b", clientCode: "client-a" },
        { employmentId: 10, roleId: 6, roleCode: "role-a", clientCode: "client-a" },
      ],
      privilegeRows: [
        { roleId: 7, privilegeCode: "write" },
        { roleId: 6, privilegeCode: "read" },
        { roleId: 6, privilegeCode: "audit" },
        { roleId: 8, privilegeCode: "export" },
      ],
    } as unknown as UserProfileBuildDataset;
    const builder = createUserProfileBuilder({
      buildRepository: {
        loadByUserIds: mock(async () => dataset),
      },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const profile = await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" });

    expect(profile).not.toBeNull();
    expect(profile?.subjectFacts).toEqual({
      employments: [
        {
          isPrimary: true,
          organization: {
            code: "DEPT",
            name: "DEPT name",
            type: "部门",
            path: [
              { code: "ROOT", name: "ROOT name", type: "分公司" },
              { code: "DEPT", name: "DEPT name", type: "部门" },
            ],
          },
          position: {
            code: "POS1000",
            name: "Position 1000",
          },
          clientAuthorizations: [
            {
              clientCode: "client-a",
              roles: [
                { code: "role-a", privileges: ["audit", "read"] },
                { code: "role-b", privileges: ["write"] },
              ],
            },
            {
              clientCode: "client-b",
              roles: [
                { code: "role-z", privileges: ["export"] },
              ],
            },
          ],
        },
        {
          isPrimary: false,
          organization: {
            code: "TEAM",
            name: "TEAM name",
            type: "部门",
            path: [
              { code: "BRANCH", name: "BRANCH name", type: "分公司" },
              { code: "TEAM", name: "TEAM name", type: "部门" },
            ],
          },
          position: {
            code: "POS2000",
            name: "Position 2000",
          },
          clientAuthorizations: [],
        },
      ],
    });
  });

  test("builds detail and search documents from the batch dataset", async () => {
    const dataset: UserProfileBuildDataset = {
      users: [
        user(1),
        user(2, { status: UserStatus.Pause, isDelete: true }),
      ] as UserProfileBuildDataset["users"],
      employments: [
        employment(10, 1, 100, 1000, true),
        employment(11, 1, 200, 2000),
        employment(12, 1, 300, 3000, false, { status: EmploymentStatus.Disable, endTime: now }),
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
        { employmentId: 10, roleId: 1, roleCode: "position-role", clientCode: "portal" },
        { employmentId: 10, roleId: 2, roleCode: "employment-role", clientCode: "portal" },
        { employmentId: 10, roleId: 3, roleCode: "organization-role", clientCode: "portal" },
        { employmentId: 11, roleId: 4, roleCode: "second-role", clientCode: "portal" },
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

    const profiles = await builder.buildMany([
      { userId: 1, sourceDirtyVersion: "7" },
      { userId: 2, sourceDirtyVersion: "7" },
    ]);
    const activeProfile = profiles.find(item => item.userId === 1)!;
    const hiddenProfile = profiles.find(item => item.userId === 2)!;

    expect(activeProfile.profileSchemaVersion).toBe(LEGACY_USER_PROFILE_SCHEMA_VERSION);
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
