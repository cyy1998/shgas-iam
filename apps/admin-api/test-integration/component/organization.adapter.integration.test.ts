import type { Context } from "hono";
import { createOrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00Z");

function createContext(roles: string[] = ["iam:hr-admin"]) {
  const policy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: [10, 20],
        organizationIds: [10, 11, 20, 21],
      }),
    },
    logger: { warn: mock() },
  });
  return {
    req: {
      header: () => undefined,
    },
    get(key: string) {
      if (key === "adminAuthorizationPolicy")
        return policy;
      if (key === "userId")
        return 7;
      if (key === "username")
        return "operator";
      if (key === "userDetailDto")
        return { roles };
      return undefined;
    },
  } as unknown as Context;
}

function organizationDetail() {
  return {
    id: 10,
    orgCode: "ROOT-A",
    orgName: "Root A",
    parentId: -1,
    businessParentId: -1,
    path: "/10",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    isLeaf: false,
    parentCode: null,
    parentName: null,
    statusText: "正常",
    childrenCount: 1,
    employmentCount: 0,
    authorizationFacts: {
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      childrenCount: 1,
      employmentCount: 0,
      hasOpenResponsibilityAssignment: false,
    },
  };
}

describe("admin Organization adapter", () => {
  test("returns the complete server-owned action map for HR detail", async () => {
    const getOrganizationDetailByCodeForAdmin = mock(async () => organizationDetail());
    const adapter = createOrganizationAdapter({
      organizationService: { getOrganizationDetailByCodeForAdmin },
    } as never);

    const detail = await adapter.organizationAdminRouter
      .createCaller({ hono: createContext() })
      .detail({ orgCode: "ROOT-A" });

    expect(detail.allowedActions).toEqual({
      createChild: { allowed: true, reason: null },
      edit: { allowed: true, reason: null },
      changeStatus: { allowed: true, reason: null },
      delete: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
    });
    expect(getOrganizationDetailByCodeForAdmin).toHaveBeenCalledWith(
      "ROOT-A",
      expect.objectContaining({
        kind: "scoped",
        rootOrganizationIds: [10, 20],
        organizationIds: [10, 11, 20, 21],
      }),
    );
    expect(detail).not.toHaveProperty("authorizationFacts");
  });

  test("passes server-resolved HR scope to every Organization query and mutation", async () => {
    const service = {
      searchOrganizationsForAdmin: mock(async () => ({
        result: [],
        total: 0,
        pageNum: 1,
        pageSize: 10,
        pages: 0,
      })),
      getOrganizationChildrenForAdmin: mock(async () => ({
        result: [],
        total: 0,
        pageNum: 1,
        pageSize: 20,
        pages: 0,
      })),
      getOrganizationSelectorNodesForAdmin: mock(async () => []),
      getOrganizationDetailByCodeForAdmin: mock(async () => organizationDetail()),
      setOrganization: mock(async () => true),
      updateOrganization: mock(async () => true),
      updateOrganizationStatus: mock(async () => true),
      deleteOrganization: mock(async () => true),
    };
    const adapter = createOrganizationAdapter({ organizationService: service } as never);
    const caller = adapter.organizationAdminRouter.createCaller({ hono: createContext() });
    const searchInput = {
      conditions: { fuzzyConditions: {}, exactConditions: {} },
      pageNum: 1,
      pageSize: 10,
    };

    await caller.search(searchInput);
    await caller.children({ parentOrgCode: null, pageNum: 1, pageSize: 20 });
    await caller.selector({ pageSize: 50 });
    await caller.detail({ orgCode: "ROOT-A" });
    await caller.create({
      orgCode: "CHILD",
      orgName: "Child",
      orgType: OrganizationType.Department,
      parentCode: "ROOT-A",
      status: OrganizationStatus.Enable,
    });
    await caller.update({
      orgCode: "ROOT-A",
      data: { orgName: "Renamed" },
    });
    await caller.updateStatus({
      orgCode: "ROOT-A",
      status: OrganizationStatus.Pause,
    });
    await caller.delete({ orgCode: "ROOT-A" });

    const scoped = expect.objectContaining({
      kind: "scoped",
      rootOrganizationIds: [10, 20],
      organizationIds: [10, 11, 20, 21],
    });
    expect(service.searchOrganizationsForAdmin).toHaveBeenCalledWith(searchInput, scoped);
    expect(service.getOrganizationChildrenForAdmin).toHaveBeenCalledWith(null, 1, 20, scoped);
    expect(service.getOrganizationSelectorNodesForAdmin).toHaveBeenCalledWith(
      { pageSize: 50 },
      scoped,
    );
    expect(service.setOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ parentCode: "ROOT-A" }),
      expect.anything(),
      scoped,
    );
    expect(service.updateOrganization).toHaveBeenCalledWith(
      "ROOT-A",
      { orgName: "Renamed" },
      expect.anything(),
      scoped,
    );
    expect(service.updateOrganizationStatus).toHaveBeenCalledWith(
      "ROOT-A",
      OrganizationStatus.Pause,
      expect.anything(),
      scoped,
    );
    expect(service.deleteOrganization).toHaveBeenCalledWith(
      "ROOT-A",
      expect.anything(),
      scoped,
    );
  });

  test("rejects a direct reparent payload before invoking the Organization service", async () => {
    const updateOrganization = mock(async () => true);
    const adapter = createOrganizationAdapter({
      organizationService: { updateOrganization },
    } as never);
    const caller = adapter.organizationAdminRouter.createCaller({ hono: createContext() });

    let failure: unknown;
    try {
      await caller.update({
        orgCode: "ROOT-A",
        data: { parentCode: "ROOT-B" },
      } as never);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(updateOrganization).not.toHaveBeenCalled();
  });
});
