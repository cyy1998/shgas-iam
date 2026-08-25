import { createOrganizationRepository } from "@admin-api/services/organization/organization.repository";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import {
  OrganizationHasEmploymentError,
  OrganizationHasOpenResponsibilityAssignmentError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";
import { describe, expect, mock, test } from "bun:test";
import { createOpenEmploymentFixtureDb } from "../helpers/drizzle-query-capture";

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orgCode: "ORG",
    orgName: "Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/ORG",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00Z"),
    updateTime: new Date("2026-01-01T00:00:00Z"),
    parent: null,
    children: [],
    ...overrides,
  };
}

function createService() {
  const selectorNodes = [{
    id: 1,
    orgCode: "ORG",
    orgName: "Organization",
    orgType: OrganizationType.Company,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.One,
    parentId: -1,
    isLeaf: true,
    fullPath: [],
    pathText: "Organization",
    selectable: true,
  }];
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    responsibilityParentLifecycle: {
      assertNoOpenAssignmentsTargetingOrganizationSubtree: mock(
        async () => undefined,
      ),
    },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    organizationRepository: {
      countActiveChildrenByOrgCode: mock(async () => 0),
      countOpenEmploymentsByOrgCode: mock(async (_orgCode: string) => 0),
      getOrganizationByCode: mock(async () => null),
      getOrganizationByCodeForAdmin: mock(async () => organization()),
      setOrganization: mock(async () => organization()),
      softDeleteOrganizationByCode: mock(async () => organization({ isDelete: true })),
      updateOrganizationByCode: mock(async () => organization()),
    },
  };
  const deps = {
    organizationRepository: {
      countOpenEmploymentsByOrgCode: mock(async (_orgCode: string) => 0),
      getOrganizationByCodeForAdmin: mock(async () => organization()),
      getOrganizationSelectorNodesForAdmin: mock(async () => selectorNodes),
      listOrgChildrenByParentCode: mock(async () => ({ rows: [], total: 0 })),
      searchOrganizationsForAdmin: mock(async () => []),
    },
    responsibilityReader: {
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createOrganizationService(deps), tx, deps, selectorNodes };
}

function scopedAuthorization(
  organizationIds: readonly number[] = [1],
  rootOrganizationIds: readonly number[] = [1],
) {
  const denyMutation = mock((input: { concealExistence?: boolean }) => {
    if (input.concealExistence)
      throw new OrganizationNotFoundError();
    throw new Error("denied");
  });
  return {
    authorization: {
      kind: "scoped" as const,
      organizationIds,
      rootOrganizationIds,
      denyMutation,
      getAllowedActions: mock(),
    },
    denyMutation,
  };
}

function useEmploymentFixture(
  tx: ReturnType<typeof createService>["tx"],
  fixture: {
    status: EmploymentStatus;
    isDelete: boolean;
    ancestorOrgCodes?: readonly string[];
  },
) {
  const repository = createOrganizationRepository(createOpenEmploymentFixtureDb([{
    ...fixture,
    ancestorOrgCodes: fixture.ancestorOrgCodes ?? ["ORG"],
  }]) as any);
  tx.organizationRepository.countOpenEmploymentsByOrgCode = mock(repository.countOpenEmploymentsByOrgCode);
}

describe("createOrganizationService", () => {
  test("applies the HR scope to selector, search, tree, and detail reads", async () => {
    const { service, deps } = createService();
    const { authorization } = scopedAuthorization([1, 2], [1]);
    const scope = {
      organizationIds: [1, 2],
      rootOrganizationIds: [1],
    };
    const searchQuery = {
      conditions: { fuzzyConditions: {}, exactConditions: {} },
      pageNum: 1,
      pageSize: 10,
    } as any;
    const selectorQuery = { pageSize: 50 } as any;

    await service.searchOrganizationsForAdmin(searchQuery, authorization as any);
    await service.getOrganizationSelectorNodesForAdmin(selectorQuery, authorization as any);
    await service.getOrganizationChildrenForAdmin(null, 1, 20, authorization as any);
    const detail = await service.getOrganizationDetailByCodeForAdmin("ORG", authorization as any);

    expect(deps.organizationRepository.searchOrganizationsForAdmin)
      .toHaveBeenCalledWith(searchQuery, scope);
    expect(deps.organizationRepository.getOrganizationSelectorNodesForAdmin)
      .toHaveBeenCalledWith(selectorQuery, scope);
    expect(deps.organizationRepository.listOrgChildrenByParentCode)
      .toHaveBeenCalledWith(null, 1, 20, scope);
    expect(deps.organizationRepository.getOrganizationByCodeForAdmin)
      .toHaveBeenLastCalledWith("ORG", scope);
    expect(detail.authorizationFacts).toEqual({
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      childrenCount: 0,
      employmentCount: 0,
      hasOpenResponsibilityAssignment: false,
    });
  });

  test("returns 404 before reading children for an out-of-scope parent", async () => {
    const { service, deps } = createService();
    const { authorization } = scopedAuthorization();
    deps.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValueOnce(null);

    let failure: unknown;
    try {
      await service.getOrganizationChildrenForAdmin("OTHER", 1, 20, authorization as any);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
    expect(deps.organizationRepository.listOrgChildrenByParentCode).not.toHaveBeenCalled();
  });

  test("rejects HR root creation and never writes an Organization", async () => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization();

    let failure: unknown;
    try {
      await service.setOrganization({
        orgCode: "NEW",
        orgName: "New Root",
        orgType: OrganizationType.Company,
        parentCode: null,
      } as any, undefined, authorization as any);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(denyMutation).toHaveBeenCalledWith({
      operationId: "admin.organization.create",
      resourceIdentifier: "NEW",
      reason: "ACTION_NOT_GRANTED",
    });
    expect(tx.organizationRepository.setOrganization).not.toHaveBeenCalled();
  });

  test("creates an HR child only below an enabled in-scope parent", async () => {
    const { service, tx } = createService();
    const { authorization } = scopedAuthorization();
    tx.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValueOnce(
      organization(),
    );

    await service.setOrganization({
      orgCode: "CHILD",
      orgName: "Child",
      orgType: OrganizationType.Department,
      parentCode: "ORG",
    } as any, undefined, authorization as any);

    expect(tx.organizationRepository.setOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ orgCode: "CHILD", parentCode: "ORG" }),
      expect.objectContaining({ id: 1, orgCode: "ORG" }),
    );
  });

  test("conceals an existing out-of-scope orgCode during HR child creation", async () => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization();
    tx.organizationRepository.getOrganizationByCode.mockResolvedValueOnce(
      organization({ id: 99, orgCode: "OUTSIDE" }) as never,
    );
    tx.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValueOnce(
      organization(),
    );

    let failure: unknown;
    try {
      await service.setOrganization({
        orgCode: "OUTSIDE",
        orgName: "Probe",
        orgType: OrganizationType.Department,
        parentCode: "ORG",
      } as any, undefined, authorization as any);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
    expect(denyMutation).toHaveBeenCalledWith({
      operationId: "admin.organization.create",
      resourceIdentifier: "OUTSIDE",
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(tx.organizationRepository.setOrganization).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
  });

  test.each([
    ["missing or deleted", null, "RESOURCE_OUT_OF_SCOPE", true],
    ["out of scope", organization({ id: 99, orgCode: "OTHER" }), "RESOURCE_OUT_OF_SCOPE", true],
    [
      "paused",
      organization({ status: OrganizationStatus.Pause }),
      "RESOURCE_STATE_NOT_ACTIONABLE",
      false,
    ],
    [
      "disabled",
      organization({ status: OrganizationStatus.Disable }),
      "RESOURCE_STATE_NOT_ACTIONABLE",
      false,
    ],
  ])("rejects HR child creation below a %s parent", async (
    _label,
    parent,
    reason,
    concealExistence,
  ) => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization();
    tx.organizationRepository.getOrganizationByCodeForAdmin
      .mockResolvedValueOnce(parent as never);

    let failure: unknown;
    try {
      await service.setOrganization({
        orgCode: "CHILD",
        orgName: "Child",
        orgType: OrganizationType.Department,
        parentCode: "PARENT",
      } as any, undefined, authorization as any);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(denyMutation).toHaveBeenCalledWith({
      operationId: "admin.organization.create",
      resourceIdentifier: "PARENT",
      reason,
      ...(concealExistence ? { concealExistence: true } : {}),
    });
    expect(tx.organizationRepository.setOrganization).not.toHaveBeenCalled();
  });

  test("conceals an out-of-scope HR mutation and performs zero writes", async () => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization([2], [2]);

    let failure: unknown;
    try {
      await service.updateOrganization(
        "ORG",
        { orgName: "Forbidden" },
        undefined,
        authorization as any,
      );
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
    expect(denyMutation).toHaveBeenCalledWith({
      operationId: "admin.organization.update",
      resourceIdentifier: "ORG",
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rejects an HR Organization code change while allowing approved mutable fields", async () => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization();

    let failure: unknown;
    try {
      await service.updateOrganization(
        "ORG",
        { orgCode: "RENAMED" },
        undefined,
        authorization as any,
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect(denyMutation).toHaveBeenCalledWith({
      operationId: "admin.organization.update",
      resourceIdentifier: "ORG",
      reason: "ACTION_NOT_GRANTED",
    });
    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();

    await service.updateOrganization(
      "ORG",
      { orgName: "Renamed", orgType: OrganizationType.Department },
      undefined,
      authorization as any,
    );
    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith(
      "ORG",
      { orgName: "Renamed", orgType: OrganizationType.Department },
    );
  });

  test.each([
    ["status", "admin.organization.updateStatus"],
    ["delete", "admin.organization.delete"],
  ])("conceals an out-of-scope HR Organization %s mutation", async (
    operation,
    operationId,
  ) => {
    const { service, tx } = createService();
    const { authorization, denyMutation } = scopedAuthorization([2], [2]);

    let failure: unknown;
    try {
      if (operation === "status") {
        await service.updateOrganizationStatus(
          "ORG",
          OrganizationStatus.Pause,
          undefined,
          authorization as any,
        );
      }
      else {
        await service.deleteOrganization("ORG", undefined, authorization as any);
      }
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
    expect(denyMutation).toHaveBeenCalledWith({
      operationId,
      resourceIdentifier: "ORG",
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
    expect(tx.organizationRepository.softDeleteOrganizationByCode).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
  });

  test("allows HR status and delete mutations for an in-scope Organization when integrity guards pass", async () => {
    const { service, tx } = createService();
    const { authorization } = scopedAuthorization();

    await service.updateOrganizationStatus(
      "ORG",
      OrganizationStatus.Pause,
      undefined,
      authorization as any,
    );
    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith(
      "ORG",
      { status: OrganizationStatus.Pause },
    );

    tx.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValueOnce(
      organization({ status: OrganizationStatus.Pause }),
    );
    await service.deleteOrganization("ORG", undefined, authorization as any);
    expect(tx.organizationRepository.softDeleteOrganizationByCode)
      .toHaveBeenCalledWith("ORG");
  });

  test("forwards selector queries to the root repository", async () => {
    const { service, deps, selectorNodes } = createService();
    const query = { parentOrgCode: "ROOT", pageSize: 50 };

    await expect(service.getOrganizationSelectorNodesForAdmin(query as any)).resolves.toBe(selectorNodes);

    expect(deps.organizationRepository.getOrganizationSelectorNodesForAdmin)
      .toHaveBeenCalledWith(query, undefined);
  });

  test("rejects deleting an organization with active children", async () => {
    const { service, tx } = createService();
    tx.organizationRepository.countActiveChildrenByOrgCode.mockResolvedValue(1);

    await expect(service.deleteOrganization("ORG")).rejects.toThrow();

    expect(tx.organizationRepository.softDeleteOrganizationByCode).not.toHaveBeenCalled();
  });

  test("blocks deletion on an Open responsibility target before other subtree guards", async () => {
    const { service, tx } = createService();
    tx.responsibilityParentLifecycle
      .assertNoOpenAssignmentsTargetingOrganizationSubtree
      .mockRejectedValueOnce(
        new OrganizationHasOpenResponsibilityAssignmentError(),
      );
    tx.organizationRepository.countActiveChildrenByOrgCode.mockResolvedValue(1);

    await expect(service.deleteOrganization("ORG")).rejects.toBeInstanceOf(
      OrganizationHasOpenResponsibilityAssignmentError,
    );

    expect(
      tx.responsibilityParentLifecycle
        .assertNoOpenAssignmentsTargetingOrganizationSubtree,
    ).toHaveBeenCalledWith({ organizationId: 1 });
    expect(
      tx.organizationRepository.countActiveChildrenByOrgCode,
    ).not.toHaveBeenCalled();
    expect(tx.organizationRepository.softDeleteOrganizationByCode).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test.each([
    ["Enable", EmploymentStatus.Enable],
    ["Pause", EmploymentStatus.Pause],
  ])("rejects deleting an organization whose hierarchy contains an Open Employment in %s state", async (
    _label,
    employmentStatus,
  ) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status: employmentStatus, isDelete: false });

    await expect(service.deleteOrganization("ORG")).rejects.toBeInstanceOf(OrganizationHasEmploymentError);

    expect(tx.organizationRepository.softDeleteOrganizationByCode).not.toHaveBeenCalled();
  });

  test("rejects updating to an existing organization code", async () => {
    const { service, tx } = createService();
    (tx.organizationRepository.getOrganizationByCode as any)
      .mockResolvedValue(organization({ id: 2, orgCode: "OTHER" }));

    await expect(service.updateOrganization("ORG", { orgCode: "OTHER" } as any)).rejects.toThrow("组织编码已存在");

    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
  });

  test("records an organization change when updating an organization", async () => {
    const { service, tx } = createService();

    await expect(service.updateOrganization("ORG", { orgName: "New Organization" })).resolves.toBe(true);

    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "organization", organizationId: 1 },
    ]);
  });

  test("does not treat an unchanged Pause status as a lifecycle transition during metadata edits", async () => {
    const { service, tx } = createService();
    tx.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValue(
      organization({ status: OrganizationStatus.Pause }),
    );
    tx.responsibilityParentLifecycle
      .assertNoOpenAssignmentsTargetingOrganizationSubtree
      .mockRejectedValue(
        new OrganizationHasOpenResponsibilityAssignmentError(),
      );

    await expect(service.updateOrganization("ORG", {
      orgName: "Renamed Organization",
      status: OrganizationStatus.Pause,
    })).resolves.toBe(true);

    expect(
      tx.responsibilityParentLifecycle
        .assertNoOpenAssignmentsTargetingOrganizationSubtree,
    ).not.toHaveBeenCalled();
    expect(
      tx.organizationRepository.countOpenEmploymentsByOrgCode,
    ).not.toHaveBeenCalled();
    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith(
      "ORG",
      { orgName: "Renamed Organization", status: OrganizationStatus.Pause },
    );
  });

  test("blocks Pause or Disable when the Organization subtree is an Open responsibility target", async () => {
    const { service, tx } = createService();
    tx.responsibilityParentLifecycle
      .assertNoOpenAssignmentsTargetingOrganizationSubtree
      .mockRejectedValueOnce(
        new OrganizationHasOpenResponsibilityAssignmentError(),
      );

    await expect(
      service.updateOrganizationStatus("ORG", OrganizationStatus.Pause),
    ).rejects.toBeInstanceOf(
      OrganizationHasOpenResponsibilityAssignmentError,
    );

    expect(
      tx.responsibilityParentLifecycle
        .assertNoOpenAssignmentsTargetingOrganizationSubtree,
    ).toHaveBeenCalledWith({ organizationId: 1 });
    expect(
      tx.organizationRepository.countOpenEmploymentsByOrgCode,
    ).not.toHaveBeenCalled();
    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
  });

  test.each([
    ["Ended Employment", EmploymentStatus.Disable, false],
    ["Legacy Employment Tombstone", EmploymentStatus.Enable, true],
  ])("allows an organization status change when referenced only by %s history", async (_label, status, isDelete) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status, isDelete });

    await expect(service.updateOrganizationStatus("ORG", OrganizationStatus.Disable)).resolves.toBe(true);

    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith("ORG", {
      status: OrganizationStatus.Disable,
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "organization", organizationId: 1 },
    ]);
  });

  test.each([
    ["Enable", EmploymentStatus.Enable, OrganizationStatus.Pause],
    ["Pause", EmploymentStatus.Pause, OrganizationStatus.Disable],
  ])(
    "rejects a status transition when the hierarchy contains an Open Employment in %s state",
    async (_employmentState, employmentStatus, status) => {
      const { service, tx } = createService();
      useEmploymentFixture(tx, { status: employmentStatus, isDelete: false });

      await expect(service.updateOrganizationStatus("ORG", status))
        .rejects
        .toBeInstanceOf(OrganizationHasEmploymentError);

      expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
    },
  );

  test("re-enables an organization without inspecting or changing its Employments", async () => {
    const { service, tx } = createService();
    tx.organizationRepository.getOrganizationByCodeForAdmin.mockResolvedValue(
      organization({ status: OrganizationStatus.Disable }),
    );
    tx.organizationRepository.countOpenEmploymentsByOrgCode.mockResolvedValue(1);

    await expect(service.updateOrganizationStatus("ORG", OrganizationStatus.Enable)).resolves.toBe(true);

    expect(tx.organizationRepository.countOpenEmploymentsByOrgCode).not.toHaveBeenCalled();
    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith("ORG", {
      status: OrganizationStatus.Enable,
    });
  });

  test("allows disabling an organization when an Open Employment is outside its hierarchy", async () => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, {
      status: EmploymentStatus.Enable,
      isDelete: false,
      ancestorOrgCodes: ["OTHER"],
    });

    await expect(service.updateOrganizationStatus("ORG", OrganizationStatus.Disable)).resolves.toBe(true);

    expect(tx.organizationRepository.updateOrganizationByCode).toHaveBeenCalledWith("ORG", {
      status: OrganizationStatus.Disable,
    });
  });

  test.each([
    ["Ended Employment", EmploymentStatus.Disable, false],
    ["Legacy Employment Tombstone", EmploymentStatus.Enable, true],
  ])("allows deleting an organization referenced only by %s history", async (_label, status, isDelete) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status, isDelete });

    await expect(service.deleteOrganization("ORG")).resolves.toBe(true);

    expect(tx.organizationRepository.countActiveChildrenByOrgCode).toHaveBeenCalledWith("ORG");
    expect(tx.organizationRepository.countOpenEmploymentsByOrgCode).toHaveBeenCalledWith("ORG");
    expect(tx.organizationRepository.softDeleteOrganizationByCode).toHaveBeenCalledWith("ORG");
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "organization", organizationId: 1 },
    ]);
  });
});
