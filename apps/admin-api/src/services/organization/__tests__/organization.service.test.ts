import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const organizationRepository = {
  getOrganizationSelectorNodesForAdmin: mock(),
};

mock.module("@admin-api/services/organization/organization.repository", () => organizationRepository);

const organizationService = await import("../organization.service");

afterAll(() => {
  mock.restore();
});

function selectorNode(overrides: Record<string, unknown> = {}) {
  const root = {
    id: 1,
    orgCode: "SR",
    orgName: "上海燃气",
    orgType: OrganizationType.Company,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.One,
    parentId: -1,
    pathIndex: 0,
  };
  const node = {
    id: 2,
    orgCode: "SR23",
    orgName: "信息中心",
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.Two,
    parentId: 1,
    pathIndex: 1,
  };
  return {
    ...node,
    isLeaf: true,
    fullPath: [root, node],
    pathText: "上海燃气 / 信息中心",
    selectable: true,
    ...overrides,
  };
}

beforeEach(() => {
  organizationRepository.getOrganizationSelectorNodesForAdmin.mockReset();
});

describe("organizationService.getOrganizationSelectorNodesForAdmin", () => {
  test("returns lazy-loaded selector children with full path and selectable state", async () => {
    const child = selectorNode();
    const query = {
      parentOrgCode: "SR",
      pageSize: 50,
      selectableOrgTypes: [OrganizationType.Department],
      selectableStatuses: [OrganizationStatus.Enable],
    };
    organizationRepository.getOrganizationSelectorNodesForAdmin.mockResolvedValue([child]);

    await expect(organizationService.getOrganizationSelectorNodesForAdmin(query)).resolves.toEqual([child]);
    expect(organizationRepository.getOrganizationSelectorNodesForAdmin).toHaveBeenCalledWith(query);
  });

  test("returns search echo nodes for text or orgCode including non-selectable nodes", async () => {
    const match = selectorNode({ selectable: false, isLeaf: false });
    const query = {
      text: "信息",
      orgCode: "SR23",
      pageSize: 20,
      selectableOrgTypes: [OrganizationType.Company],
    };
    organizationRepository.getOrganizationSelectorNodesForAdmin.mockResolvedValue([match]);

    await expect(organizationService.getOrganizationSelectorNodesForAdmin(query)).resolves.toMatchObject([
      {
        orgCode: "SR23",
        fullPath: [{ orgCode: "SR" }, { orgCode: "SR23" }],
        pathText: "上海燃气 / 信息中心",
        selectable: false,
      },
    ]);
    expect(organizationRepository.getOrganizationSelectorNodesForAdmin).toHaveBeenCalledWith(query);
  });
});
