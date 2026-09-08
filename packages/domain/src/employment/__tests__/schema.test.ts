import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { toEmploymentDto } from "../schema";

const now = new Date("2026-01-01T00:00:00.000Z");

function base(id: number) {
  return {
    id,
    isDelete: false,
    createTime: now,
    updateTime: now,
  };
}

function orgNode(
  id: number,
  orgCode: string,
  orgName: string,
  orgType: OrganizationType,
  pathIndex: number,
  distanceToAssignedOrg: number,
) {
  return {
    id,
    orgCode,
    orgName,
    orgType,
    level: pathIndex + OrganizationLevel.One,
    parentId: pathIndex === 0 ? -1 : id - 1,
    isVirtual: false,
    isEntity: true,
    pathIndex,
    distanceToAssignedOrg,
  };
}

function employmentInput(companyNodes = [
  orgNode(1, "ROOT", "集团", OrganizationType.Company, 0, 2),
  orgNode(2, "COMP", "公司", OrganizationType.Company, 1, 1),
]) {
  const assignedOrg = orgNode(3, "DEPT", "部门", OrganizationType.Department, 2, 0);
  const fullOrgPath = [...companyNodes, assignedOrg].map((node, pathIndex) => ({ ...node, pathIndex }));
  return {
    ...base(10),
    userId: 100,
    posId: 200,
    orgId: assignedOrg.id,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    user: {
      ...base(100),
      username: "u001",
      wxId: null,
      name: "用户",
      password: null,
      mobile: "13800000000",
      userType: UserType.Formal,
      orderNum: 0,
      status: UserStatus.Enable,
    },
    position: {
      ...base(200),
      posCode: "POS",
      posName: "岗位",
      status: PositionStatus.Enable,
      description: null,
    },
    organization: {
      assignedOrg,
      fullOrgPath,
      companyNodes,
    },
  };
}

describe("toEmploymentDto", () => {
  test("maps structured summaries, full path, and company nodes", () => {
    const input = employmentInput();
    const dto = toEmploymentDto({
      ...input,
      internalNote: "private employment context",
      user: { ...input.user, password: "private password hash", subjectIdentifier: "private-subject" },
      position: { ...input.position, internalNote: "private position context" },
      organization: {
        ...input.organization,
        internalNote: "private organization context",
        assignedOrg: { ...input.organization.assignedOrg, internalNote: "private node context" },
        fullOrgPath: input.organization.fullOrgPath.map(node => ({ ...node, internalNote: "private path context" })),
        companyNodes: input.organization.companyNodes.map(node => ({ ...node, internalNote: "private company context" })),
      },
    });

    const root = orgNode(1, "ROOT", "集团", OrganizationType.Company, 0, 2);
    const company = orgNode(2, "COMP", "公司", OrganizationType.Company, 1, 1);
    const department = orgNode(3, "DEPT", "部门", OrganizationType.Department, 2, 0);
    expect(dto).toEqual({
      ...base(10),
      userId: 100,
      posId: 200,
      orgId: 3,
      isPrimary: true,
      status: EmploymentStatus.Enable,
      startTime: now,
      endTime: null,
      description: null,
      user: { id: 100, username: "u001", name: "用户", mobile: "13800000000", wxId: null },
      position: { id: 200, posCode: "POS", posName: "岗位" },
      organization: {
        assignedOrg: department,
        fullOrgPath: [root, company, department],
        companyNodes: [root, company],
      },
    });
  });

  test("returns empty company nodes when no Company ancestor exists", () => {
    const dto = toEmploymentDto(employmentInput([]));

    expect(dto.organization).toEqual({
      assignedOrg: orgNode(3, "DEPT", "部门", OrganizationType.Department, 2, 0),
      fullOrgPath: [{ ...orgNode(3, "DEPT", "部门", OrganizationType.Department, 2, 0), pathIndex: 0 }],
      companyNodes: [],
    });
  });
});
