import { describe, expect, test } from "bun:test";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { OrganizationCreateDtoSchema, toOrganizationDto } from "../index";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");

function organization(id = 1, orgCode = "ORG") {
  return {
    id,
    orgCode,
    orgName: `${orgCode} name`,
    parentId: -1,
    businessParentId: -1,
    path: `/${orgCode}`,
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: createdAt,
    updateTime: updatedAt,
  };
}

describe("OrganizationCreateDtoSchema", () => {
  test("preserves supported create fields and strips storage-only fields", () => {
    const input = OrganizationCreateDtoSchema.parse({
      ...organization(),
      businessParentId: 7,
      orderNum: 3,
      isVirtual: true,
      isEntity: false,
      parentCode: "PARENT",
      storageSecret: "private",
    });

    expect(input).toStrictEqual({
      orgCode: "ORG",
      orgName: "ORG name",
      orgType: OrganizationType.Company,
      businessParentId: 7,
      orderNum: 3,
      isVirtual: true,
      isEntity: false,
      path: "/ORG",
      level: OrganizationLevel.One,
      status: OrganizationStatus.Enable,
      parentCode: "PARENT",
    });
  });
});

describe("toOrganizationDto", () => {
  test.each([
    { name: "without a parent", parent: null, parentCode: null, parentName: null },
    { name: "with a parent", parent: organization(2, "PARENT"), parentCode: "PARENT", parentName: "PARENT name" },
  ])("maps a leaf $name to a flat DTO and strips storage-only fields", ({ parent, parentCode, parentName }) => {
    const output = toOrganizationDto({
      ...organization(),
      parentId: parent?.id ?? -1,
      parent,
      children: [],
      storageSecret: "private",
    });

    expect(output).toStrictEqual({
      id: 1,
      orgCode: "ORG",
      orgName: "ORG name",
      parentId: parent?.id ?? -1,
      businessParentId: -1,
      path: "/ORG",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
      orderNum: 0,
      isVirtual: false,
      isEntity: true,
      status: OrganizationStatus.Enable,
      isDelete: false,
      createTime: createdAt,
      updateTime: updatedAt,
      isLeaf: true,
      parentCode,
      parentName,
    });
  });
});
