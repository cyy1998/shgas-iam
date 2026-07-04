import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType, PositionStatus, UserProfileDirtyReason, UserStatus, UserType } from "@iam/contracts";
import { EmploymentAlreadyExistsError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { createEmploymentService } from "../employment.service";

const now = new Date("2026-01-01T00:00:00Z");

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    oidcSubject: "00000000-0000-4000-8000-000000000001",
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
    organization: { assignedOrg: organization() },
    ...overrides,
  };
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    profileDirtyMarker: {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [1] })),
    },
    employmentRepository: {
      createEmploymentRecord: mock(async () => employment({ id: 10 })),
      endActiveEmploymentsByUserId: mock(async () => undefined),
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
      updateUserByUsername: mock(async () => user()),
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
    roleRepository: {
      getRolesByEmploymentId: mock(async () => []),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createEmploymentService(deps), tx, deps };
}

describe("createEmploymentService", () => {
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
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
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
    expect(tx.profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
  });

  test("disabling an employment sets end time from the injected clock", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmploymentStatus(4, EmploymentStatus.Disable)).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: now,
    });
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
    }));
  });

  test("updates an employment and marks its existing user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmployment(4, { description: "updated" })).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      isPrimary: undefined,
      startTime: undefined,
      description: "updated",
    });
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
    }));
  });

  test("deletes an employment after capturing the affected user", async () => {
    const { service, tx } = createService();

    await expect(service.deleteEmployment(4)).resolves.toBe(true);

    expect(tx.employmentRepository.softDeleteEmployment).toHaveBeenCalledWith(4);
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
    }));
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
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
    }));
  });

  test("sets a primary employment and marks the user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.setPrimaryEmployment(4)).resolves.toBe(true);

    expect(tx.employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(1, 4);
    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, { isPrimary: true });
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
    }));
  });

  test("resigns a user and marks both employment and user profile reasons dirty", async () => {
    const { service, tx } = createService();

    await expect(service.resignUser("zhangsan")).resolves.toBe(true);

    expect(tx.employmentRepository.endActiveEmploymentsByUserId).toHaveBeenCalledWith(1);
    expect(tx.userRepository.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated, UserProfileDirtyReason.UserUpdated],
    }));
  });
});
