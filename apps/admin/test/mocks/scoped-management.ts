import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import {
  adminEmploymentSearchResult,
  currentHrAdminUser,
  hrAdminCapabilitySummary,
  hrAdminEmploymentDetail,
  hrAdminUserDetail,
} from "./fixtures";
import { mockAdminRpc, mockCurrentAdminUser, type RpcResolvers } from "./rpc";
import { server } from "./server";

export const scopedOrganizationRoots = [
  {
    id: 10,
    orgCode: "ROOT-A",
    orgName: "授权根 A",
    orgType: OrganizationType.Company,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.One,
    parentId: -1,
    orderNum: 1,
    isLeaf: true,
  },
  {
    id: 20,
    orgCode: "ROOT-B",
    orgName: "授权根 B",
    orgType: OrganizationType.Company,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.One,
    parentId: -1,
    orderNum: 2,
    isLeaf: true,
  },
];
export const scopedOrganizationOptions = scopedOrganizationRoots.map((root) => ({
  ...root,
  fullPath: [
    {
      id: root.id,
      orgCode: root.orgCode,
      orgName: root.orgName,
      orgType: root.orgType,
      status: root.status,
      level: root.level,
      parentId: root.parentId,
      pathIndex: 0,
    },
  ],
  pathText: root.orgName,
  selectable: true,
}));

export function mockScopedManagement(overrides: RpcResolvers = {}) {
  const rpc = mockAdminRpc({
    "admin.authorization.capabilitySummary": () => hrAdminCapabilitySummary,
    "admin.user.detail": () => hrAdminUserDetail,
    "admin.organization.selector": () => scopedOrganizationOptions,
    "admin.organizationResponsibility.searchAssignments": () => ({ items: [], total: 0, nextCursor: null }),
    "admin.organizationResponsibility.listAssignments": () => ({ items: [], total: 0, nextCursor: null }),
    "admin.employment.search": () => adminEmploymentSearchResult,
    "admin.employment.detail": () => hrAdminEmploymentDetail,
    ...overrides,
  });
  server.use(mockCurrentAdminUser(currentHrAdminUser), rpc.handler);
  return rpc;
}
