import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");

function baseRecord(id: number) {
  return {
    id,
    isDelete: false,
    createTime: createdAt,
    updateTime: updatedAt,
  };
}

function user(id = 1) {
  return {
    ...baseRecord(id),
    username: `user${id}`,
    wxId: null,
    name: `User ${id}`,
    password: null,
    mobile: `1380000000${id}`,
    userType: UserType.Formal,
    orderNum: id,
    status: UserStatus.Enable,
  };
}

function organization(id = 1, orgCode = `ORG${id}`, orgType = OrganizationType.Department) {
  return {
    ...baseRecord(id),
    orgCode,
    orgName: `${orgCode} name`,
    parentId: -1,
    businessParentId: -1,
    path: `/${orgCode}`,
    level: OrganizationLevel.One,
    orgType,
    orderNum: id,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
  };
}

function position(id = 1) {
  return {
    ...baseRecord(id),
    posCode: `POS${id}`,
    posName: `Position ${id}`,
    status: PositionStatus.Enable,
    description: null,
  };
}

function employment() {
  return {
    ...baseRecord(1),
    userId: 1,
    posId: 1,
    orgId: 10,
    compId: 20,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: createdAt,
    endTime: null,
    description: null,
    user: user(1),
    department: organization(10, "DEPT", OrganizationType.Department),
    company: organization(20, "COMP", OrganizationType.Company),
    position: position(1),
  };
}

describe("admin API DTO mappers", () => {
  test("maps organization details to a flat DTO", async () => {
    const schemaModule = await import("../organization/organization.schema") as any;

    expect(typeof schemaModule.toOrganizationDto).toBe("function");
    expect(schemaModule.toOrganizationDto({
      ...organization(2, "CHILD"),
      parent: organization(1, "PARENT"),
      children: [],
    })).toMatchObject({
      orgCode: "CHILD",
      isLeaf: true,
      parentCode: "PARENT",
      parentName: "PARENT name",
    });
  });

  test("maps employment details to a flat DTO", async () => {
    const schemaModule = await import("../employment/employment.schema") as any;

    expect(typeof schemaModule.toEmploymentDto).toBe("function");
    expect(schemaModule.toEmploymentDto(employment())).toMatchObject({
      username: "user1",
      name: "User 1",
      posCode: "POS1",
      posName: "Position 1",
      orgCode: "DEPT",
      compCode: "COMP",
    });
  });
});
