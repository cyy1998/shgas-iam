// Browser Integration uses a mocked backend; this is not a full-system journey.
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import type { Page } from "@playwright/test";
import {
  adminEmploymentSearchResult,
  adminPositionSearchResult,
  createHrEmploymentAllowedActions,
  currentHrAdminUser,
  hrAdminCapabilitySummary,
  hrAdminEmploymentDetail,
  hrAdminUserDetail,
} from "../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "./fixtures";

export function collectMutationRequests(page: Page) {
  const requests: string[] = [];
  const mutationOperation =
    /admin\.[^.]+\.(?:create|update|delete|reset|generate|resign|transfer|pause|resume|end|set|clear|revoke|release|assign|remove|configure|enable|disable|rotate|change)/;

  page.on("request", (request) => {
    const url = decodeURIComponent(request.url());
    if (mutationOperation.test(url)) requests.push(url);
  });
  return requests;
}

export async function mockScopedManagementApi(page: Page) {
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: hrAdminUserDetail,
  });
  await page.route("**/rpc/admin.organizationResponsibility.searchAssignments**", (route) =>
    fulfillTrpc(route, { items: [], total: 0, nextCursor: null }),
  );
  const roots = [
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
  const selectorNodes = roots.map((root) => ({
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
  await page.route("**/rpc/admin.organization.*", (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split("/").at(-1)!.split(",");
    const inputs: Record<string, { orgCode?: string; parentOrgCode?: string | null }> = JSON.parse(
      url.searchParams.get("input") ?? "{}",
    );
    const responses = procedures.map((procedure, index) => {
      const input = inputs[String(index)] ?? {};
      if (procedure === "admin.organization.selector") return { result: { data: selectorNodes } };
      if (procedure === "admin.organizationResponsibility.searchAssignments")
        return { result: { data: { items: [], total: 0, nextCursor: null } } };
      if (procedure === "admin.organization.children" || procedure === "admin.organization.search") {
        const result = procedure.endsWith(".children") && !input.parentOrgCode ? roots : [];
        return {
          result: {
            data: {
              result,
              total: result.length,
              pageNum: 1,
              pageSize: procedure === "admin.organization.search" ? 20 : 50,
              pages: result.length ? 1 : 0,
            },
          },
        };
      }
      if (procedure !== "admin.organization.detail")
        throw new Error(`Unexpected organization mock procedure: ${procedure}`);
      const root = roots.find((item) => item.orgCode === input.orgCode) ?? roots[0];
      return {
        result: {
          data: {
            ...root,
            businessParentId: -1,
            path: `/${root.id}`,
            isVirtual: false,
            isEntity: true,
            isDelete: false,
            parentCode: null,
            parentName: null,
            statusText: "正常",
            childrenCount: 0,
            employmentCount: 1,
            createTime: "2026-08-20T00:00:00.000Z",
            updateTime: "2026-08-20T00:00:00.000Z",
            allowedActions: {
              createChild: { allowed: true, reason: null },
              edit: { allowed: true, reason: null },
              changeStatus: {
                allowed: false,
                reason: "INTEGRITY_GUARD_BLOCKED",
              },
              delete: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
            },
          },
        },
      };
    });
    return fulfillJson(route, responses);
  });
  const employmentSearchInputs: unknown[] = [];
  const employmentTransfers: unknown[] = [];
  type MockEmploymentDetail = Omit<
    typeof hrAdminEmploymentDetail,
    "allowedActions" | "description" | "endTime" | "status"
  > & {
    allowedActions: ReturnType<typeof createHrEmploymentAllowedActions>;
    description: string | null;
    endTime: string | null;
    status: EmploymentStatus;
  };
  let employmentDetail: MockEmploymentDetail = {
    ...hrAdminEmploymentDetail,
    description: hrAdminEmploymentDetail.description as string | null,
  };
  const setEmploymentStatus = (status: EmploymentStatus) => {
    employmentDetail = {
      ...employmentDetail,
      status,
      endTime: status === EmploymentStatus.Disable ? "2026-08-24T00:00:00.000Z" : null,
      allowedActions: createHrEmploymentAllowedActions(status, employmentDetail.isPrimary),
    };
  };
  await page.route("**/rpc/admin.employment.search**", (route) => {
    employmentSearchInputs.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, adminEmploymentSearchResult);
  });
  await page.route("**/rpc/admin.employment.detail**", (route) => fulfillTrpc(route, employmentDetail));
  await page.route("**/rpc/admin.employment.transfer**", (route) => {
    employmentTransfers.push(parseTrpcBatchInput(route));
    setEmploymentStatus(EmploymentStatus.Disable);
    return fulfillTrpc(route, { changed: true, result: { id: 100 } });
  });
  await page.route("**/rpc/admin.position.search,admin.organization.selector**", (route) =>
    fulfillJson(route, [{ result: { data: adminPositionSearchResult } }, { result: { data: selectorNodes } }]),
  );
  await page.route("**/rpc/admin.organization.selector,admin.employment.detail**", (route) =>
    fulfillJson(route, [{ result: { data: selectorNodes } }, { result: { data: employmentDetail } }]),
  );
  return { employmentSearchInputs, employmentTransfers };
}
