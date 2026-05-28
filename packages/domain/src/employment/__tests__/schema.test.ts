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
    const dto = toEmploymentDto(employmentInput());

    expect(dto.user).toMatchObject({ username: "u001", name: "用户" });
    expect(dto.position).toMatchObject({ posCode: "POS", posName: "岗位" });
    expect(dto.organization.fullOrgPath.map(node => node.orgCode)).toEqual(["ROOT", "COMP", "DEPT"]);
    expect(dto.organization.companyNodes.map(node => node.orgCode)).toEqual(["ROOT", "COMP"]);
    expect(dto.organization.assignedOrg.orgCode).toBe("DEPT");
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
  });

  test("returns empty company nodes when no Company ancestor exists", () => {
    const dto = toEmploymentDto(employmentInput([]));

    expect(dto.organization.companyNodes).toEqual([]);
    expect(dto).not.toHaveProperty("compCode");
    expect(dto).not.toHaveProperty("compName");
  });
});
