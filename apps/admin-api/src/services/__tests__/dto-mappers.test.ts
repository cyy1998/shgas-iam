import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
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
});
