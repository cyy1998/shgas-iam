import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  PositionStatus,
  UserProfileDirtyReason,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserService } from "../user.service";

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

function employment(id: number, status: EmploymentStatus) {
  const assignedOrg = {
    id: 2,
    orgCode: "ORG",
    orgName: "Organization",
    orgType: OrganizationType.Department,
    level: OrganizationLevel.Two,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    pathIndex: 0,
    distanceToAssignedOrg: 0,
  };
  return {
    id,
    userId: 1,
    posId: 3,
    orgId: 2,
    isPrimary: false,
    status,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    user: user(),
    position: {
      id: 3,
      posCode: "DEV",
      posName: "Developer",
      status: PositionStatus.Enable,
      description: null,
      isDelete: false,
      createTime: now,
      updateTime: now,
    },
    organization: {
      assignedOrg,
      fullOrgPath: [assignedOrg],
      companyNodes: [],
    },
  };
}

function revokeSummary() {
  return {
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  };
}

function createAfterCommitLogger() {
  return {
    warn: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
    error: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
  };
}

function createService(options: { afterCommitLogger?: ReturnType<typeof createAfterCommitLogger> } = {}) {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    profileDirtyMarker: {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [1] })),
    },
    userRepository: {
      countActiveEmploymentsByUsername: mock(async () => 0),
      getUserByUsernameForAdmin: mock(async () => null),
      setPassword: mock(async () => user()),
      setUserForAdmin: mock(async (input: Record<string, unknown>) => user(input)),
      softDeleteUserByUsername: mock(async () => user({ isDelete: true })),
      updateUserByUsername: mock(async (_username: string, input: Record<string, unknown>) => user(input)),
    },
  };
  const deps = {
    employmentRepository: {
      getAllEmploymentsByUserIdForAdmin: mock(async () => []),
    },
    passwordHasher: createFakePasswordHasher(),
    privilegeRepository: {
      getPrivilegesByRoleIds: mock(async () => []),
    },
    random: createFakeRandom(),
    roleAssignmentResolver: {
      resolveEffectiveRoles: mock(async () => new Map()),
    },
    sessionRevocation: {
      revokeUserSessions: mock(async () => revokeSummary()),
    },
    uow: createImmediateUnitOfWork(tx, { logger: options.afterCommitLogger }),
    userRepository: {
      getUserByUsernameForAdmin: mock(async () => user()),
      searchUsersFuzzyPaged: mock(async () => ({ rows: [user()], total: 1 })),
    },
  } as any;
  return { service: createUserService(deps), deps, tx };
}

describe("createUserService", () => {
  test("resolves Effective Roles once for every employment in a user detail", async () => {
    const { service, deps } = createService();
    deps.employmentRepository.getAllEmploymentsByUserIdForAdmin.mockResolvedValueOnce([
      employment(4, EmploymentStatus.Enable),
      employment(5, EmploymentStatus.Disable),
    ]);
    deps.roleAssignmentResolver.resolveEffectiveRoles.mockResolvedValueOnce(new Map([
      [4, [
        { id: 11, roleCode: "admin" },
        { id: 12, roleCode: "reviewer" },
      ]],
      [5, [{ id: 13, roleCode: "legacy" }]],
    ]));
    deps.privilegeRepository.getPrivilegesByRoleIds.mockImplementation(async (roleIds: number[]) =>
      roleIds.map(roleId => ({ privilegeCode: `privilege:${roleId}` })));

    const detail = await service.getUserDetailByUsernameForAdmin("zhangsan");

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).toHaveBeenCalledTimes(1);
    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).toHaveBeenCalledWith({ employmentIds: [4, 5] });
    expect(detail.employments.map(item => ({
      id: item.id,
      roles: item.roles,
      privileges: item.privileges,
    }))).toEqual([
      { id: 4, roles: ["admin", "reviewer"], privileges: ["privilege:11", "privilege:12"] },
      { id: 5, roles: ["legacy"], privileges: ["privilege:13"] },
    ]);
    expect(detail.roles).toEqual(["admin", "reviewer"]);
    expect(detail.privileges).toEqual(["privilege:11", "privilege:12"]);
  });

  test("keeps empty Effective Role results empty in user detail", async () => {
    const { service, deps } = createService();
    deps.employmentRepository.getAllEmploymentsByUserIdForAdmin.mockResolvedValueOnce([
      employment(4, EmploymentStatus.Enable),
    ]);
    deps.roleAssignmentResolver.resolveEffectiveRoles.mockResolvedValueOnce(new Map([[4, []]]));

    const detail = await service.getUserDetailByUsernameForAdmin("zhangsan");

    expect(deps.privilegeRepository.getPrivilegesByRoleIds).toHaveBeenCalledWith([]);
    expect(detail.employments[0]).toMatchObject({ roles: [], privileges: [] });
    expect(detail.roles).toEqual([]);
    expect(detail.privileges).toEqual([]);
  });

  test("keeps the existing user-not-found behavior before resolving roles", async () => {
    const { service, deps } = createService();
    deps.userRepository.getUserByUsernameForAdmin.mockResolvedValueOnce(null);

    await expect(service.getUserDetailByUsernameForAdmin("missing")).rejects.toThrow("用户不存在");

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).not.toHaveBeenCalled();
  });

  test("creates users with a generated password when none is provided", async () => {
    const { service, deps, tx } = createService();

    await expect(service.setUserForAdmin({
      username: "zhangsan",
      name: "张三",
      userType: UserType.Formal,
    })).resolves.toEqual({
      username: "zhangsan",
      generatedPassword: "Rand1234",
    });

    expect(deps.passwordHasher.hashPassword).toHaveBeenCalledWith("Rand1234");
    expect(tx.userRepository.setUserForAdmin).toHaveBeenCalledWith(expect.objectContaining({
      username: "zhangsan",
      password: "hashed:Rand1234",
      status: UserStatus.Enable,
    }));
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.create",
      targetCode: "zhangsan",
    }));
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
  });

  test("rejects duplicate usernames before creating", async () => {
    const { service, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.setUserForAdmin({
      username: "zhangsan",
      name: "张三",
      userType: UserType.Formal,
    })).rejects.toThrow("用户名已存在");

    expect(tx.userRepository.setUserForAdmin).not.toHaveBeenCalled();
  });

  test("revokes user sessions when disabling a user", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.updateUser("zhangsan", { status: UserStatus.Disable })).resolves.toBe(true);

    expect(tx.userRepository.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
    }));
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      reason: "user_disabled",
      auditContext: undefined,
    });
  });

  test("keeps user status update successful when session revocation fails", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps, tx } = createService({ afterCommitLogger });
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());
    const revocationFailure = new Error("revocation failed");
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 100,
      requestId: "req-user-revoke",
      traceId: "11111111111111111111111111111111",
    };
    deps.sessionRevocation.revokeUserSessions.mockRejectedValueOnce(revocationFailure);

    await expect(service.updateUser("zhangsan", { status: UserStatus.Disable }, auditContext)).resolves.toBe(true);

    expect(tx.userRepository.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalled();
    expect(afterCommitLogger.warn).toHaveBeenCalledWith({
      afterCommit: "admin.session_revoke.user",
      mode: "bestEffort",
      err: revocationFailure,
      requestId: "req-user-revoke",
      traceId: "11111111111111111111111111111111",
    }, "best-effort afterCommit task failed");
    expect(afterCommitLogger.error).not.toHaveBeenCalled();
  });

  test("revokes user sessions when deleting a user", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.deleteUser("zhangsan")).resolves.toBe(true);

    expect(tx.userRepository.softDeleteUserByUsername).toHaveBeenCalledWith("zhangsan");
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith(expect.objectContaining({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
    }));
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      reason: "user_deleted",
      auditContext: undefined,
    });
  });

  test("rejects deleting a user with active employments", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());
    tx.userRepository.countActiveEmploymentsByUsername.mockResolvedValue(1);

    await expect(service.deleteUser("zhangsan")).rejects.toThrow();

    expect(tx.userRepository.softDeleteUserByUsername).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("resets a user password with the injected random password and revokes sessions", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.resetPasswordByUsername("zhangsan")).resolves.toBe("Rand1234");

    expect(deps.passwordHasher.hashPassword).toHaveBeenCalledWith("Rand1234");
    expect(tx.userRepository.setPassword).toHaveBeenCalledWith(1, "hashed:Rand1234");
    expect(tx.profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      reason: "admin_revoke",
      exceptPrincipalSessionId: undefined,
      auditContext: undefined,
    });
  });

  test("keeps current PrincipalSession when an admin resets their own password", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 1,
      principalSessionId: "ps-current",
    };

    await expect(service.resetPasswordByUsername("zhangsan", auditContext)).resolves.toBe("Rand1234");

    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      reason: "admin_revoke",
      exceptPrincipalSessionId: "ps-current",
      auditContext,
    });
  });
});
