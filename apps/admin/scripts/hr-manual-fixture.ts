import {
  EmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import type { BrowserContext } from "@playwright/test";
import {
  adminPositionSearchResult,
  adminUsers,
  createHrEmploymentAllowedActions,
  currentHrAdminUser,
  hrAdminCapabilitySummary,
  hrAdminEmploymentDetail,
  hrAdminUserDetail,
} from "../test/mocks/fixtures";
import { fulfillJson } from "../test-integration/fixtures";

const allowed = { allowed: true, reason: null } as const;
const blocked = { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" } as const;
const rootA = {
  id: 10,
  orgCode: "DEMO-A",
  orgName: "示例公司 A",
  orgType: OrganizationType.Company,
  status: OrganizationStatus.Enable,
  level: OrganizationLevel.One,
  parentId: -1,
  orderNum: 1,
  isLeaf: false,
};
const rootB = { ...rootA, id: 20, orgCode: "DEMO-B", orgName: "示例公司 B", orderNum: 2, isLeaf: true };
const finance = {
  ...rootA,
  id: 30,
  orgCode: "DEMO-FIN",
  orgName: "财务部",
  orgType: OrganizationType.Department,
  level: OrganizationLevel.Two,
  parentId: rootA.id,
  isLeaf: true,
};
const organizations = [rootA, rootB, finance];
const selectorNodes = organizations.map((organization) => {
  const path = organization.parentId === rootA.id ? [rootA, organization] : [organization];
  return {
    ...organization,
    fullPath: path.map((node, pathIndex) => ({ ...node, pathIndex })),
    pathText: path.map((node) => node.orgName).join(" / "),
    selectable: true,
  };
});
const users = adminUsers.map((user) => ({ ...user, mobile: null }));
const [employee, newHire] = users;
const [financePosition] = adminPositionSearchResult.result;
const operationsPosition = {
  ...financePosition,
  id: 2,
  posCode: "OPS-001",
  posName: "运营专员",
  description: "运营岗位",
};
const employments = [
  {
    ...hrAdminEmploymentDetail,
    user: employee,
    organization: { assignedOrg: finance, fullOrgPath: [rootA, finance], companyNodes: [rootA] },
    isPrimary: false,
    roles: [],
    roleNames: {},
    allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, false),
  },
];
const userDetail = {
  ...hrAdminUserDetail,
  ...employee,
  employments,
  roles: [],
  roleNames: {},
  allowedActions: { ...hrAdminUserDetail.allowedActions, changeStatus: allowed, resign: allowed },
};
const assignment = {
  id: 101,
  typeCode: OrganizationResponsibilityTypeCode.Head,
  targetOrganization: { ...rootB, fullPath: [rootB] },
  holder: {
    employmentId: employments[0].id,
    user: employee,
    organization: { ...finance, fullPath: [rootA, finance] },
    position: financePosition,
  },
  status: OrganizationResponsibilityAssignmentStatus.Enable,
  startTime: "2026-01-06T08:00:00.000Z",
  endTime: null,
  allowedActions: {
    pause: allowed,
    resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
    end: allowed,
  },
};

function list<T>(result: T[]) {
  return { result, total: result.length, pageNum: 1, pageSize: 20, pages: result.length ? 1 : 0 };
}

type Query = {
  orgCode?: string;
  parentOrgCode?: string | null;
  conditions?: { fuzzyConditions?: { text?: string } };
};

export async function mockHrManualApi(context: BrowserContext, origin: string) {
  let assignmentCreated = false;
  function responseFor(procedure: string, query: Query) {
    switch (procedure) {
      case "admin.authorization.capabilitySummary":
        return {
          ...hrAdminCapabilitySummary,
          collectionActions: {
            ...hrAdminCapabilitySummary.collectionActions,
            organizationResponsibility: { create: allowed },
          },
        };
      case "admin.user.search": {
        const keyword = query.conditions?.fuzzyConditions?.text;
        return list(keyword ? users.filter((user) => `${user.name} ${user.username}`.includes(keyword)) : users);
      }
      case "admin.user.detail":
        return userDetail;
      case "admin.employment.search":
        return list(employments);
      case "admin.employment.detail":
        return employments[0];
      case "admin.position.search":
        return list([financePosition, operationsPosition]);
      case "admin.organization.children": {
        const parent = organizations.find((organization) => organization.orgCode === query.parentOrgCode);
        return list(organizations.filter((organization) => organization.parentId === (parent?.id ?? -1)));
      }
      case "admin.organization.search":
        return list(organizations);
      case "admin.organization.selector":
        return selectorNodes;
      case "admin.organization.detail": {
        const organization = organizations.find((item) => item.orgCode === query.orgCode);
        if (!organization) throw new Error("Unknown example organization");
        return {
          ...organization,
          businessParentId: -1,
          path: organization.parentId === rootA.id ? `/${rootA.id}/${organization.id}` : `/${organization.id}`,
          isVirtual: false,
          isEntity: true,
          isDelete: false,
          parentCode: organization.parentId === rootA.id ? rootA.orgCode : null,
          parentName: organization.parentId === rootA.id ? rootA.orgName : null,
          statusText: "正常",
          childrenCount: organization.isLeaf ? 0 : 1,
          employmentCount: organization.id === finance.id ? 1 : 0,
          createTime: "2026-01-01T08:00:00.000Z",
          updateTime: "2026-01-01T08:00:00.000Z",
          allowedActions: { createChild: allowed, edit: allowed, changeStatus: blocked, delete: blocked },
        };
      }
      case "admin.organizationResponsibility.listTypes":
        return ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG;
      case "admin.organizationResponsibility.searchAssignments":
        return { items: assignmentCreated ? [assignment] : [], total: assignmentCreated ? 1 : 0, nextCursor: null };
      case "admin.organizationResponsibility.detailAssignment":
        return assignment;
      case "admin.organizationResponsibility.createAssignment":
        assignmentCreated = true;
        return { changed: true, result: { id: assignment.id } };
      default:
        throw new Error(`Unmocked manual procedure: ${procedure}`);
    }
  }

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.endsWith("/public/user-info")) {
      return fulfillJson(route, { code: 200, message: "OK", data: currentHrAdminUser });
    }
    if (url.pathname.includes("/rpc/")) {
      const procedures = url.pathname.split("/rpc/")[1].split(",");
      const request = route.request();
      const inputs: Record<string, Query> = JSON.parse(request.postData() ?? url.searchParams.get("input") ?? "{}");
      return fulfillJson(
        route,
        procedures.map((procedure, index) => ({ result: { data: responseFor(procedure, inputs[index] ?? {}) } })),
      );
    }
    if (url.pathname.startsWith("/iam-admin/")) return route.continue();
    return route.abort();
  });
}

export const manualExample = { employee, newHire, rootA, rootB, finance, financePosition, operationsPosition };
