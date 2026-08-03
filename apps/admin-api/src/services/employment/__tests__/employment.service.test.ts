import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType, PositionStatus, UserStatus, UserType } from "@iam/contracts";
import { EmploymentAlreadyExistsError, EmploymentOrganizationScopeMismatchError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { createEmploymentService } from "../employment.service";

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
      getEmploymentByUserOrgPosId: mock(async () => null),
      softDeleteEmployment: mock(async () => employment({ isDelete: true })),
      unsetPrimariesByUserId: mock(async () => undefined),
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

  test("creates a primary employment and clears existing primaries", async () => {
    const { service, tx } = createService();

    await expect(service.createEmploymentForAdmin({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
      isPrimary: true,
      startTime: now,
    })).resolves.toEqual({ id: 10 });

    expect(tx.employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(1, null);
    expect(tx.employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      orgId: 2,
      posId: 3,
      isPrimary: true,
      status: EmploymentStatus.Enable,
    }));
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.create",
      targetId: 10,
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("rejects creating an employment for an unknown user", async () => {
    const { service, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(null);

    await expect(service.createEmploymentForAdmin({
      username: "missing",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toThrow("用户不存在");

    expect(tx.employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("does not audit or mark dirty when storage rejects a duplicate employment", async () => {
    const { service, tx } = createService();
    (tx.employmentRepository.createEmploymentRecord as any)
      .mockRejectedValue(new EmploymentAlreadyExistsError("相同任职关系已存在"));

    await expect(service.createEmploymentForAdmin({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);

    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rejects create when assigned organization is outside expected ancestor", async () => {
    const { service, tx } = createService();
    (tx.organizationRepository.isOrganizationDescendantOf as any).mockResolvedValue(false);

    await expect(service.createEmploymentForAdmin({
      username: "zhangsan",
      orgCode: "DEPT",
      expectedAncestorOrgCode: "COMPANY",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(EmploymentOrganizationScopeMismatchError);

    expect(tx.employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
  });

  test("disabling an employment sets end time from the injected clock", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmploymentStatus(4, EmploymentStatus.Disable)).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: now,
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("updates an employment and marks its existing user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmployment(4, { description: "updated" })).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      isPrimary: undefined,
      startTime: undefined,
      description: "updated",
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("deletes an employment after capturing the affected user", async () => {
    const { service, tx } = createService();

    await expect(service.deleteEmployment(4)).resolves.toBe(true);

    expect(tx.employmentRepository.softDeleteEmployment).toHaveBeenCalledWith(4);
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("transfers an employment and marks the original user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.transferEmployment(4, {
      newOrgCode: "ORG",
      newPosCode: "DEV",
      inheritPrimary: false,
    })).resolves.toEqual({ newEmploymentId: 10 });

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: now,
      isPrimary: false,
    });
    expect(tx.employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      orgId: 2,
      posId: 3,
      isPrimary: false,
      status: EmploymentStatus.Enable,
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("sets a primary employment and marks the user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.setPrimaryEmployment(4)).resolves.toBe(true);

    expect(tx.employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(1, 4);
    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, { isPrimary: true });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });
});
