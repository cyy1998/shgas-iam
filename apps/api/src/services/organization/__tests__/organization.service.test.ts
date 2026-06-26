import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createOrganizationService } from "../organization.service";

const now = new Date("2026-01-01T00:00:00.000Z");

function organization() {
  return {
    id: 1,
    orgCode: "ORG",
    orgName: "Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/1",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    parent: null,
    children: [],
  };
}

function createService(repositoryResult: ReturnType<typeof organization> | null = organization()) {
  const deps = {
    organizationRepository: {
      getOrganizationByCode: mock(async () => repositoryResult),
      searchOrganizations: mock(async () => []),
    },
    uow: {
      transaction: mock(async () => undefined),
    },
  };

  return {
    deps,
    service: createOrganizationService(deps as never),
  };
}

describe("createOrganizationService", () => {
  test("returns null when finding a missing organization by code", async () => {
    const { deps, service } = createService(null);

    await expect(service.findOrganizationByCode("MISSING")).resolves.toBeNull();
    expect(deps.organizationRepository.getOrganizationByCode).toHaveBeenCalledWith("MISSING");
  });

  test("keeps getOrganizationByCode not found behavior", async () => {
    const { service } = createService(null);

    await expect(service.getOrganizationByCode("MISSING")).rejects.toThrow("组织不存在");
  });
});
