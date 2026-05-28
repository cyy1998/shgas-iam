import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  PrivilegeDelegationStatus,
  PrivilegeStatus,
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
  const company = organization(20, "COMP", OrganizationType.Company);
  const dept = organization(10, "DEPT", OrganizationType.Department);
  return {
    ...baseRecord(1),
    userId: 1,
    posId: 1,
    orgId: 10,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: createdAt,
    endTime: null,
    description: null,
    user: user(1),
    organization: {
      assignedOrg: { ...dept, pathIndex: 1, distanceToAssignedOrg: 0 },
      fullOrgPath: [
        { ...company, pathIndex: 0, distanceToAssignedOrg: 1 },
        { ...dept, pathIndex: 1, distanceToAssignedOrg: 0 },
      ],
      companyNodes: [{ ...company, pathIndex: 0, distanceToAssignedOrg: 1 }],
    },
    position: position(1),
  };
}

function privilege(id = 1) {
  return {
    ...baseRecord(id),
    privilegeCode: `priv:${id}`,
    privilegeName: `Privilege ${id}`,
    fieldValues: null,
    status: PrivilegeStatus.Enable,
    description: null,
  };
}

function privilegeDelegationDetail() {
  return {
    ...baseRecord(1),
    delegatorUserId: 1,
    delegateeUserId: 2,
    organizationScopeId: 10,
    startTime: createdAt,
    endTime: updatedAt,
    status: PrivilegeDelegationStatus.Enable,
    description: null,
    delegatorUser: user(1),
    delegateeUser: user(2),
    organizationScope: {
      ...organization(10, "DEPT", OrganizationType.Department),
      parent: null,
      children: [],
    },
    delegationDetails: [
      {
        delegationId: 1,
        privilegeId: 1,
        privilege: privilege(1),
      },
    ],
  };
}

describe("API DTO mappers", () => {
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

  test("maps employment details to a structured DTO", async () => {
    const schemaModule = await import("../employment/employment.schema") as any;

    expect(typeof schemaModule.toEmploymentDto).toBe("function");
    const dto = schemaModule.toEmploymentDto(employment());

    expect(dto).toMatchObject({
      user: { username: "user1", name: "User 1" },
      position: { posCode: "POS1", posName: "Position 1" },
      organization: {
        assignedOrg: { orgCode: "DEPT" },
        companyNodes: [{ orgCode: "COMP" }],
      },
    });
    for (const field of [
      "username",
      "name",
      "mobile",
      "wxId",
      "posCode",
      "posName",
      "orgCode",
      "orgName",
      "orgType",
      "compCode",
      "compName",
    ]) {
      expect(dto).not.toHaveProperty(field);
    }

    const withoutCompany = schemaModule.toEmploymentDto({
      ...employment(),
      organization: {
        ...employment().organization,
        companyNodes: [],
      },
    });
    expect(withoutCompany.organization.companyNodes).toEqual([]);
    expect(withoutCompany).not.toHaveProperty("compCode");
    expect(withoutCompany).not.toHaveProperty("compName");
  });

  test("maps privilege delegation details to summary and detail DTOs", async () => {
    const schemaModule = await import("../privilege/privilegeDelegation.schema") as any;
    const detail = privilegeDelegationDetail();

    expect(typeof schemaModule.toPrivilegeDelegationDto).toBe("function");
    expect(typeof schemaModule.toPrivilegeDelegationDetailDto).toBe("function");
    expect(schemaModule.toPrivilegeDelegationDto(detail)).toMatchObject({
      delegatorUsername: "user1",
      delegatorName: "User 1",
      delegateeUsername: "user2",
      delegateeName: "User 2",
    });
    expect(schemaModule.toPrivilegeDelegationDetailDto(detail)).toMatchObject({
      delegatorUser: { username: "user1", orcasId: null },
      delegateeUser: { username: "user2", orcasId: null },
      organizationScope: { orgCode: "DEPT", isLeaf: true },
      privileges: [{ privilegeCode: "priv:1" }],
    });
  });
});
