import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType, PositionStatus, UserStatus, UserType } from "@iam/contracts";
import { EmploymentNotEditableError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00Z");

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    username: "zhangsan",
    wxId: null,
    name: "张三",
    password: null,
    mobile: "13800000000",
    userType: UserType.Formal,
    orderNum: 0,
    status: UserStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    orgCode: "ORG",
    orgName: "Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/ORG",
    level: OrganizationLevel.Two,
    orgType: OrganizationType.Department,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    posCode: "DEV",
    posName: "Developer",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function employment(overrides: Record<string, unknown> = {}) {
  const assignedOrg = {
    ...organization(),
    pathIndex: 0,
    distanceToAssignedOrg: 0,
  };
  return {
    id: 4,
    userId: 1,
    posId: 3,
    orgId: 2,
    isPrimary: false,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    user: user(),
    position: position(),
    organization: {
      assignedOrg,
      fullOrgPath: [assignedOrg],
      companyNodes: [],
    },
    ...overrides,
  };
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    employmentRepository: {
      createEmploymentRecord: mock(async () => employment({ id: 10 })),
      getEmploymentByIdForAdmin: mock(async () => employment()),
      getOpenEmploymentByUserOrgPosId: mock(async () => null),
      updateEmploymentRecord: mock(async () => employment()),
    },
    organizationRepository: {
      getOrganizationByCode: mock(async () => organization()),
      isOrganizationDescendantOf: mock(async () => true),
    },
    positionRepository: {
      getPositionByCode: mock(async () => position()),
    },
    userRepository: {
      getUserByUsernameForAdmin: mock(async () => user()),
    },
  };
  const deps = {
    clock: createFakeClock(now.getTime()),
    employmentRepository: {
      getEmploymentByIdForAdmin: mock(async () => employment()),
      searchEmploymentsFuzzyForAdminPaged: mock(async () => ({ rows: [], total: 0 })),
    },
    privilegeRepository: {
      getPrivilegesByRoleIds: mock(async () => []),
    },
    roleAssignmentResolver: {
      resolveEffectiveRoles: mock(async () => new Map()),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createEmploymentService(deps), tx, deps };
}

describe("createEmploymentService", () => {
  test("resolves Effective Roles for an employment detail through the batch interface", async () => {
    const { service, deps } = createService();
    deps.roleAssignmentResolver.resolveEffectiveRoles.mockResolvedValueOnce(new Map([
      [4, [
        { id: 11, roleCode: "admin" },
        { id: 12, roleCode: "reviewer" },
      ]],
    ]));
    deps.privilegeRepository.getPrivilegesByRoleIds.mockResolvedValueOnce([
      { privilegeCode: "user:read" },
      { privilegeCode: "user:write" },
    ]);

    const detail = await service.getEmploymentDetailByIdForAdmin(4);

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).toHaveBeenCalledWith({ employmentIds: [4] });
    expect(deps.privilegeRepository.getPrivilegesByRoleIds).toHaveBeenCalledWith([11, 12]);
    expect(detail.roles).toEqual(["admin", "reviewer"]);
    expect(detail.privileges).toEqual(["user:read", "user:write"]);
  });

  test("keeps the existing employment-not-found behavior before resolving roles", async () => {
    const { service, deps } = createService();
    deps.employmentRepository.getEmploymentByIdForAdmin.mockResolvedValueOnce(null);

    await expect(service.getEmploymentDetailByIdForAdmin(404)).rejects.toThrow();

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).not.toHaveBeenCalled();
  });

  test("updates an employment and marks its existing user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmployment(4, { description: "updated" })).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      description: "updated",
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("rejects description edits for an Ended Employment", async () => {
    const { service, tx } = createService();
    tx.employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(
      employment({ status: EmploymentStatus.Disable, endTime: now, isPrimary: false }),
    );

    await expect(
      service.updateEmployment(4, { description: "rewritten" }),
    ).rejects.toBeInstanceOf(EmploymentNotEditableError);

    expect(tx.employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });
});
