import {
  EmploymentStatus,
  employmentStatusToString,
  OrganizationType,
  PositionStatus,
  positionStatusToString,
  UserStatus,
  userStatusToString,
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

function userDto() {
  return {
    ...baseRecord(1),
    username: "user1",
    wxId: null,
    name: "User 1",
    mobile: "13800000001",
    userType: UserType.Formal,
    orderNum: 1,
    status: UserStatus.Enable,
    orcasId: null,
  };
}

function employmentRecord() {
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
  };
}

function employmentDto() {
  return {
    ...employmentRecord(),
    username: "user1",
    name: "User 1",
    mobile: "13800000001",
    wxId: null,
    posCode: "POS1",
    posName: "Position 1",
    orgCode: "DEPT",
    orgType: OrganizationType.Department,
    orgName: "Department",
    compCode: "COMP",
    compName: "Company",
  };
}

function positionDetail() {
  return {
    ...baseRecord(1),
    posCode: "POS1",
    posName: "Position 1",
    status: PositionStatus.Enable,
    description: null,
    employments: [employmentRecord()],
  };
}

describe("admin route VO mappers", () => {
  test("maps user DTOs to VOs with status text", async () => {
    const schemaModule = await import("../user/user.schema") as any;

    expect(typeof schemaModule.toUserVo).toBe("function");
    expect(typeof schemaModule.toUserDetailVo).toBe("function");
    expect(schemaModule.toUserVo(userDto())).toMatchObject({
      username: "user1",
      statusText: userStatusToString[UserStatus.Enable],
    });
    expect(schemaModule.toUserDetailVo({
      ...userDto(),
      employments: [],
      privileges: ["priv:1"],
      roles: ["role:1"],
    })).toMatchObject({
      username: "user1",
      privileges: ["priv:1"],
      roles: ["role:1"],
      statusText: userStatusToString[UserStatus.Enable],
    });
  });

  test("maps employment DTOs to VOs with defaults and status text", async () => {
    const schemaModule = await import("../employment/employment.schema") as any;

    expect(typeof schemaModule.toEmploymentVo).toBe("function");
    expect(typeof schemaModule.toEmploymentDetailVo).toBe("function");
    expect(schemaModule.toEmploymentVo(employmentDto())).toMatchObject({
      username: "user1",
      statusText: employmentStatusToString[EmploymentStatus.Enable],
    });
    expect(schemaModule.toEmploymentDetailVo(employmentDto())).toMatchObject({
      privileges: [],
      roles: [],
      statusText: employmentStatusToString[EmploymentStatus.Enable],
    });
  });

  test("maps position details to VOs with member count", async () => {
    const schemaModule = await import("../position/position.schema") as any;

    expect(typeof schemaModule.toPositionVo).toBe("function");
    expect(schemaModule.toPositionVo(positionDetail())).toMatchObject({
      posCode: "POS1",
      memberNumber: 1,
      statusText: positionStatusToString[PositionStatus.Enable],
    });
  });
});
