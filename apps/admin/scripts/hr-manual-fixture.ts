import {
  EmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  type OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
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
const emptyOrg = { ...finance, id: 40, orgCode: "DEMO-PROJECT", orgName: "项目组", orderNum: 2 };
const organizations = [rootA, rootB, finance, emptyOrg];
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
const historicalEmployment = {
  ...employments[0],
  id: 43,
  organization: { assignedOrg: rootB, fullOrgPath: [rootB], companyNodes: [rootB] },
  position: operationsPosition,
  status: EmploymentStatus.Disable,
  startTime: "2025-10-01T08:00:00.000Z",
  endTime: "2025-12-31T08:00:00.000Z",
  managementPath: "/employments?employmentId=43",
  allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, false),
};
const assignment = {
  id: 101,
  targetOrganization: { ...finance, fullPath: [rootA, finance] },
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
  id?: number;
  orgCode?: string;
  parentOrgCode?: string | null;
  text?: string;
  typeCode?: OrganizationResponsibilityTypeCode;
  employmentId?: number;
  lifecycle?: "open" | "ended" | "all";
  conditions?: {
    fuzzyConditions?: { text?: string };
    exactConditions?: { statuses?: EmploymentStatus[] };
  };
};

export async function mockHrManualApi(context: BrowserContext, origin: string) {
  let assignedType: OrganizationResponsibilityTypeCode | undefined;
  let employmentStatus: EmploymentStatus = EmploymentStatus.Enable;
  let userStatus: UserStatus = UserStatus.Enable;
  let isPrimary = false;
  let newHireCreated = false;
  let transferred = false;
  let assignmentStatus: OrganizationResponsibilityAssignmentStatus = OrganizationResponsibilityAssignmentStatus.Enable;
  const endTime = "2026-01-08T08:00:00.000Z";
  const unavailable = { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" } as const;
  const notManaged = { allowed: false, reason: "USER_NOT_HR_MANAGED" } as const;
  const changed = { changed: true, result: null };
  const employmentView = () => ({
    ...employments[0],
    isPrimary,
    status: employmentStatus,
    endTime: employmentStatus === EmploymentStatus.Disable ? endTime : null,
    allowedActions: createHrEmploymentAllowedActions(employmentStatus, isPrimary),
  });
  const addedEmployments = () => [
    ...(newHireCreated
      ? [
          {
            ...historicalEmployment,
            id: 44,
            user: newHire,
            status: EmploymentStatus.Enable,
            startTime: endTime,
            endTime: null,
            managementPath: "/employments?employmentId=44",
            allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, false),
          },
        ]
      : []),
    ...(transferred
      ? [
          {
            ...historicalEmployment,
            id: 45,
            status: EmploymentStatus.Enable,
            isPrimary: true,
            startTime: endTime,
            endTime: null,
            managementPath: "/employments?employmentId=45",
            allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, true),
          },
        ]
      : []),
  ];
  const assignmentView = () => ({
    ...assignment,
    typeCode: assignedType,
    status: assignmentStatus,
    endTime: assignmentStatus === OrganizationResponsibilityAssignmentStatus.Disable ? endTime : null,
    allowedActions: {
      pause: assignmentStatus === OrganizationResponsibilityAssignmentStatus.Enable ? allowed : unavailable,
      resume: assignmentStatus === OrganizationResponsibilityAssignmentStatus.Pause ? allowed : unavailable,
      end: assignmentStatus === OrganizationResponsibilityAssignmentStatus.Disable ? unavailable : allowed,
    },
  });
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
        return {
          ...userDetail,
          status: userStatus,
          employments: [employmentView(), historicalEmployment],
          allowedActions:
            userStatus === UserStatus.Disable
              ? {
                  ...userDetail.allowedActions,
                  editProfile: notManaged,
                  resetPassword: notManaged,
                  changeStatus: notManaged,
                }
              : userDetail.allowedActions,
        };
      case "admin.user.resetPassword":
        return {
          changed: true,
          result: examplePassword,
          sessions: { userSessionsTerminated: 1, clientSessionsTerminated: 2, excluded: 0, failed: 0, unknown: 0 },
        };
      case "admin.employment.resignUser":
        userStatus = UserStatus.Disable;
        employmentStatus = EmploymentStatus.Disable;
        return changed;
      case "admin.employment.search": {
        const statuses = query.conditions?.exactConditions?.statuses;
        return list(
          [employmentView(), historicalEmployment, ...addedEmployments()].filter(
            (item) => statuses?.includes(item.status) ?? true,
          ),
        );
      }
      case "admin.employment.detail":
        return [historicalEmployment, ...addedEmployments()].find((item) => item.id === query.id) ?? employmentView();
      case "admin.employment.create":
        newHireCreated = true;
        return { changed: true, result: { id: 44 } };
      case "admin.employment.transfer":
        transferred = true;
        employmentStatus = EmploymentStatus.Disable;
        return { changed: true, result: { id: 45 } };
      case "admin.employment.setPrimary":
        isPrimary = true;
        return changed;
      case "admin.employment.pause":
        employmentStatus = EmploymentStatus.Pause;
        return changed;
      case "admin.employment.resume":
        employmentStatus = EmploymentStatus.Enable;
        return changed;
      case "admin.employment.end":
        employmentStatus = EmploymentStatus.Disable;
        return changed;
      case "admin.position.search":
        return list([financePosition, operationsPosition]);
      case "admin.organization.children": {
        const parent = organizations.find((organization) => organization.orgCode === query.parentOrgCode);
        return list(organizations.filter((organization) => organization.parentId === (parent?.id ?? -1)));
      }
      case "admin.organization.search":
        return list(organizations);
      case "admin.organization.selector":
        if (query.orgCode) return selectorNodes.filter((item) => item.orgCode === query.orgCode);
        if (query.text) {
          const keyword = query.text;
          return selectorNodes.filter((item) => `${item.orgName} ${item.orgCode}`.includes(keyword));
        }
        if ("parentOrgCode" in query) {
          const parent = organizations.find((item) => item.orgCode === query.parentOrgCode);
          return selectorNodes.filter((item) => item.parentId === (parent?.id ?? -1));
        }
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
          childrenCount: organizations.filter((item) => item.parentId === organization.id).length,
          employmentCount: organization.id === finance.id ? 1 : 0,
          createTime: "2026-01-01T08:00:00.000Z",
          updateTime: "2026-01-01T08:00:00.000Z",
          allowedActions: {
            createChild: allowed,
            edit: allowed,
            changeStatus: organization.id === emptyOrg.id ? allowed : blocked,
            delete: organization.id === emptyOrg.id ? allowed : blocked,
          },
        };
      }
      case "admin.organizationResponsibility.listTypes":
        return ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG;
      case "admin.organizationResponsibility.searchAssignments": {
        const ended = assignmentStatus === OrganizationResponsibilityAssignmentStatus.Disable;
        const items =
          assignedType && (query.lifecycle === "all" || (query.lifecycle === "ended") === ended)
            ? [assignmentView()]
            : [];
        return { items, total: items.length, nextCursor: null };
      }
      case "admin.organizationResponsibility.detailAssignment":
        return assignmentView();
      case "admin.organizationResponsibility.createAssignment":
        if (
          query.orgCode !== assignment.targetOrganization.orgCode ||
          query.employmentId !== assignment.holder.employmentId ||
          !ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.some((entry) => entry.code === query.typeCode)
        ) {
          throw new Error("Unexpected organization responsibility example");
        }
        assignedType = query.typeCode;
        return { changed: true, result: { id: assignment.id } };
      case "admin.organizationResponsibility.pauseAssignment":
        assignmentStatus = OrganizationResponsibilityAssignmentStatus.Pause;
        return changed;
      case "admin.organizationResponsibility.resumeAssignment":
        assignmentStatus = OrganizationResponsibilityAssignmentStatus.Enable;
        return changed;
      case "admin.organizationResponsibility.endAssignment":
        assignmentStatus = OrganizationResponsibilityAssignmentStatus.Disable;
        return changed;
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

export const manualExample = {
  employee,
  newHire,
  rootA,
  rootB,
  finance,
  emptyOrg,
  financePosition,
  operationsPosition,
};
export const examplePassword = "Synthetic-For-Capture-Only-001";
