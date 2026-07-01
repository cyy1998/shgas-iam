import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { OrganizationLevel, OrganizationStatus, OrganizationType, UserProfileDirtyReason, UserProfileScopeType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createOrganizationService } from "../organization.service";

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
    profileDirtyMarker: {
      markScopeDirty: mock(async () => ({ marked: 1, userIds: [1] })),
    },
    organizationRepository: {
      countActiveChildrenByOrgCode: mock(async () => 0),
      countActiveEmploymentsByOrgCode: mock(async () => 0),
      getOrganizationByCode: mock(async () => null),
      getOrganizationByCodeForAdmin: mock(async () => organization()),
      setOrganization: mock(async () => organization()),
      softDeleteOrganizationByCode: mock(async () => organization({ isDelete: true })),
      updateOrganizationByCode: mock(async () => organization()),
    },
  };
  const deps = {
    organizationRepository: {
      countActiveEmploymentsByOrgCode: mock(async () => 0),
      getOrganizationByCodeForAdmin: mock(async () => organization()),
      getOrganizationSelectorNodesForAdmin: mock(async () => selectorNodes),
      listOrgChildrenByParentCode: mock(async () => ({ rows: [], total: 0 })),
      searchOrganizationsForAdmin: mock(async () => []),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createOrganizationService(deps), tx, deps, selectorNodes };
}

describe("createOrganizationService", () => {
  test("forwards selector queries to the root repository", async () => {
    const { service, deps, selectorNodes } = createService();
    const query = { parentOrgCode: "ROOT", pageSize: 50 };

    await expect(service.getOrganizationSelectorNodesForAdmin(query as any)).resolves.toBe(selectorNodes);

    expect(deps.organizationRepository.getOrganizationSelectorNodesForAdmin).toHaveBeenCalledWith(query);
  });

  test("rejects deleting an organization with active children", async () => {
    const { service, tx } = createService();
    tx.organizationRepository.countActiveChildrenByOrgCode.mockResolvedValue(1);

    await expect(service.deleteOrganization("ORG")).rejects.toThrow();

    expect(tx.organizationRepository.softDeleteOrganizationByCode).not.toHaveBeenCalled();
  });

  test("rejects updating to an existing organization code", async () => {
    const { service, tx } = createService();
    (tx.organizationRepository.getOrganizationByCode as any)
      .mockResolvedValue(organization({ id: 2, orgCode: "OTHER" }));

    await expect(service.updateOrganization("ORG", { orgCode: "OTHER" } as any)).rejects.toThrow("组织编码已存在");

    expect(tx.organizationRepository.updateOrganizationByCode).not.toHaveBeenCalled();
  });

  test("marks descendant users dirty when updating an organization", async () => {
    const { service, tx } = createService();

    await expect(service.updateOrganization("ORG", { orgName: "New Organization" })).resolves.toBe(true);

    expect(tx.profileDirtyMarker.markScopeDirty).toHaveBeenCalledWith({
      scope: { scopeType: UserProfileScopeType.OrganizationId, scopeId: 1 },
      reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
  });
});
