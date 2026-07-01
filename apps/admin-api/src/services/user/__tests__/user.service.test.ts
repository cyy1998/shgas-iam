import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { UserProfileDirtyReason, UserStatus, UserType } from "@iam/contracts";
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
    roleRepository: {
      getRolesByEmploymentId: mock(async () => []),
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
