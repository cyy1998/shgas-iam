import type { ProfileBuildDataset } from "../../src/profile-build.repository";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createProfileBuilder } from "../../src/profile-builder.service";
import {
  parseUserProfileDetailDocument,
} from "../../src/profile.schema";

const now = new Date("2026-08-20T12:00:00.000Z");

describe("User Profile v3 builder", () => {
  test("publishes one canonical responsibility snapshot across Detail, Search, and Subject Facts", async () => {
    const dataset = createDataset();
    const loadByUserIds = mock(async () => dataset);
    const builder = createProfileBuilder({
      buildRepository: { loadByUserIds },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    const profile = await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" });

    const expectedResponsibilities = [
      {
        type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
        targetOrganization: {
          code: "TARGET-A",
          name: "Target A",
          type: OrganizationType.Department,
          path: [
            { code: "TARGET-ROOT", name: "Target Root", type: OrganizationType.Company },
            { code: "TARGET-A", name: "Target A", type: OrganizationType.Department },
          ],
        },
      },
      {
        type: { code: OrganizationResponsibilityTypeCode.Supervising, name: "分管领导" },
        targetOrganization: {
          code: "TARGET-B",
          name: "Target B",
          type: OrganizationType.Department,
          path: [
            { code: "TARGET-ROOT", name: "Target Root", type: OrganizationType.Company },
            { code: "TARGET-B", name: "Target B", type: OrganizationType.Department },
          ],
        },
      },
      {
        type: { code: OrganizationResponsibilityTypeCode.Supervising, name: "分管领导" },
        targetOrganization: {
          code: "TARGET-Z",
          name: "Target Z",
          type: OrganizationType.Department,
          path: [
            { code: "TARGET-ROOT", name: "Target Root", type: OrganizationType.Company },
            { code: "TARGET-Z", name: "Target Z", type: OrganizationType.Department },
          ],
        },
      },
    ];
    expect(profile).not.toBeNull();
    expect(profile?.profileSchemaVersion).toBe(3);
    expect(profile?.detail.employments.map(item => item.responsibilities)).toEqual([
      expectedResponsibilities,
      [],
    ]);
    expect(profile?.searchDoc.employments.map(item => item.responsibilities)).toEqual([
      expectedResponsibilities.map(responsibility => ({
        ...responsibility,
        targetOrganization: {
          ...responsibility.targetOrganization,
          path: responsibility.targetOrganization.path.map((node, index, path) => ({
            ...node,
            distanceToTarget: path.length - index - 1,
          })),
        },
      })),
      [],
    ]);
    expect(profile?.subjectFacts.employments.map(item => item.responsibilities)).toEqual([
      expectedResponsibilities,
      [],
    ]);
    expect(loadByUserIds).toHaveBeenCalledWith([1], now);
  });

  test("fails the whole candidate when a responsibility snapshot is malformed", async () => {
    const dataset = createDataset();
    dataset.responsibilityRows[0]!.targetOrganization.path = [];
    const builder = createProfileBuilder({
      buildRepository: { loadByUserIds: async () => dataset },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    let failure: unknown;
    try {
      await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
  });

  test("rejects mismatched responsibility target paths", async () => {
    const wrongTarget = createDataset();
    wrongTarget.responsibilityRows[0]!.targetOrganization.path.at(-1)!.code
      = "different-target";

    const builder = createProfileBuilder({
      buildRepository: { loadByUserIds: async () => wrongTarget },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });

    await expect(builder.buildOne({ userId: 1, sourceDirtyVersion: "7" }))
      .rejects
      .toBeInstanceOf(Error);
  });

  test("strictly parses a persisted v3 Detail without losing responsibilities", async () => {
    const builder = createProfileBuilder({
      buildRepository: { loadByUserIds: async () => createDataset() },
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    });
    const profile = await builder.buildOne({ userId: 1, sourceDirtyVersion: "7" });
    const persistedDetail = JSON.parse(JSON.stringify(profile!.detail));

    const detail = parseUserProfileDetailDocument(persistedDetail);

    expect(detail.createTime).toBeInstanceOf(Date);
    expect(detail.employments[0]?.startTime).toBeInstanceOf(Date);
    expect(detail.employments[0]?.responsibilities[0]?.type.code).toBe(
      OrganizationResponsibilityTypeCode.Head,
    );
    expect(() => parseUserProfileDetailDocument({
      ...persistedDetail,
      unexpected: true,
    })).toThrow();
    const wrongName = structuredClone(persistedDetail);
    wrongName.employments[0].responsibilities[0].type.name = "WRONG";
    expect(() => parseUserProfileDetailDocument(wrongName)).toThrow();
    const wrongTarget = structuredClone(persistedDetail);
    wrongTarget.employments[0].responsibilities[0].targetOrganization.path.at(-1).code
      = "different-target";
    expect(() => parseUserProfileDetailDocument(wrongTarget)).toThrow();
  });
});

function createDataset(): ProfileBuildDataset {
  const base = (id: number) => ({
    id,
    isDelete: false,
    createTime: now,
    updateTime: now,
  });
  return {
    users: [{
      ...base(1),
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "user1",
      wxId: "wx-1",
      name: "User 1",
      password: null,
      mobile: "13800000001",
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
    }],
    employments: [
      {
        ...base(10),
        userId: 1,
        orgId: 100,
        posId: 1000,
        isPrimary: true,
        status: EmploymentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        endTime: null,
        description: null,
      },
      {
        ...base(11),
        userId: 1,
        orgId: 110,
        posId: 1100,
        isPrimary: false,
        status: EmploymentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        endTime: null,
        description: null,
      },
    ],
    positions: [
      { ...base(1000), posCode: "POS-A", posName: "Position A", status: PositionStatus.Enable, description: null },
      { ...base(1100), posCode: "POS-B", posName: "Position B", status: PositionStatus.Enable, description: null },
    ],
    orgPathRows: [
      orgPathRow(100, 100, "HOLDER-A", 0),
      orgPathRow(110, 110, "HOLDER-B", 0),
    ],
    roleRows: [],
    privilegeRows: [],
    responsibilityRows: [
      responsibilityRow(10, OrganizationResponsibilityTypeCode.Supervising, "TARGET-Z"),
      responsibilityRow(10, OrganizationResponsibilityTypeCode.Head, "TARGET-A"),
      responsibilityRow(10, OrganizationResponsibilityTypeCode.Supervising, "TARGET-B"),
    ],
  };
}

function orgPathRow(descendantId: number, id: number, orgCode: string, depth: number) {
  return {
    descendantId,
    depth,
    id,
    orgCode,
    orgName: orgCode,
    orgType: OrganizationType.Department,
    level: OrganizationLevel.One,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
  };
}

function responsibilityRow(
  employmentId: number,
  typeCode: OrganizationResponsibilityTypeCode,
  targetCode: string,
) {
  return {
    employmentId,
    typeCode,
    targetOrganization: {
      code: targetCode,
      name: targetName(targetCode),
      type: OrganizationType.Department,
      path: [
        { code: "TARGET-ROOT", name: "Target Root", type: OrganizationType.Company },
        {
          code: targetCode,
          name: targetName(targetCode),
          type: OrganizationType.Department,
        },
      ],
    },
  };
}

function targetName(targetCode: string) {
  return `Target ${targetCode.at(-1)}`;
}
