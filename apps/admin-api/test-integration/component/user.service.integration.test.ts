import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { createUserService } from "@admin-api/services/user/user.service";
import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessRepair,
  SubjectAccessRecordV1Schema,
} from "@iam/api-core/subject-access";
import { createInMemorySubjectAccessStore } from "@iam/api-core/subject-access/testing";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00Z");
const subjectAccessNow = new Date("2026-01-01T00:05:00.000Z").getTime();
const subjectAccessMutationReceipt: SubjectAccessMutationReceipt = {
  subjectIdentifier: "00000000-0000-4000-8000-000000000001",
  transitionId: "10000000-0000-4000-8000-000000000001",
  ownerToken: "10000000-0000-4000-8000-000000000002",
};

function createSubjectAccessMutation() {
  return {
    runMutation: mock(async (
      _receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<unknown>,
    ) => await mutation()),
  };
}

function createTransitionLifecycleOptions() {
  return {
    random: {
      uuid: mock(() => subjectAccessMutationReceipt.transitionId),
    },
    transitionIntent: {
      create: mock(async (_receipt: SubjectAccessMutationReceipt) => undefined),
      assertCommitted: mock(async (
        _receipt: SubjectAccessMutationReceipt,
        _targetState: "disabled" | "enabled" | "rollback",
      ) => undefined),
      markRolledBack: mock(async (_receipt: SubjectAccessMutationReceipt) => undefined),
    },
  };
}

async function claimRepairBacklog(
  store: ReturnType<typeof createInMemorySubjectAccessStore>,
) {
  const lease = await store.claimRepairSubject({
    leaseDurationMs: 60_000,
    leaseToken: "admin-user-service-test",
  });
  return lease === null ? [] : [lease.subjectIdentifier];
}

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

function createService(options: {
  afterCommitLogger?: ReturnType<typeof createAfterCommitLogger>;
  preBlockError?: Error;
} = {}) {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    subjectAccessMutation: createSubjectAccessMutation(),
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
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
    subjectAccessLifecycle: {
      run: mock(async (input: {
        mutate: (receipt: SubjectAccessMutationReceipt) => Promise<unknown>;
        revokeSessions?: (
          result: unknown,
          context: {
            invalidatedSubjectAccessTransitionId: string;
          },
        ) => Promise<unknown>;
        observability?: { requestId?: string; traceId?: string };
      }) => {
        if (options.preBlockError)
          throw options.preBlockError;
        const result = await input.mutate(subjectAccessMutationReceipt);
        try {
          await input.revokeSessions?.(result, {
            invalidatedSubjectAccessTransitionId:
              "20000000-0000-4000-8000-000000000001",
          });
        }
        catch (error) {
          options.afterCommitLogger?.warn({
            afterCommit: "admin.session_revoke.user",
            mode: "bestEffort",
            err: error,
            requestId: input.observability?.requestId,
            traceId: input.observability?.traceId,
          }, "best-effort afterCommit task failed");
        }
        return result;
      }),
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
    deps.userRepository.getUserByUsernameForAdmin.mockResolvedValueOnce(null);

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
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
    ]);
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
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
    ]);
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      reason: "user_disabled",
      onlySubjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
      auditContext: undefined,
    });
  });

  test("does not write the database when Subject Access pre-block fails", async () => {
    const preBlockError = new Error("subject access unavailable");
    const { service, deps, tx } = createService({ preBlockError });
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.updateUser("zhangsan", { status: UserStatus.Disable }))
      .rejects
      .toBe(preBlockError);

    expect(tx.userRepository.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("routes every explicit status write through Subject Access despite a matching root snapshot", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user({
      status: UserStatus.Enable,
    }));

    await expect(service.updateUser("zhangsan", {
      status: UserStatus.Enable,
    })).resolves.toBe(true);

    expect(deps.subjectAccessLifecycle.run).toHaveBeenCalledTimes(1);
    expect(deps.subjectAccessLifecycle.run).toHaveBeenCalledWith(expect.objectContaining({
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      disposition: expect.any(Function),
    }));
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
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
    ]);
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      reason: "user_deleted",
      onlySubjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
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
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      userId: 1,
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
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
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      reason: "admin_revoke",
      exceptPrincipalSessionId: "ps-current",
      auditContext,
    });
  });

  test("restores enabled access when the highest-level status mutation rolls back", async () => {
    const mutationError = new Error("database rollback");
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Enable,
      updateUserByUsername: mock(async () => {
        throw mutationError;
      }),
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Disable,
    })).rejects.toBe(mutationError);

    expect(await fixture.readAccessState()).toBe("enabled");
    expect(await claimRepairBacklog(fixture.store)).toEqual([]);
    expect(fixture.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("commits disabled access before revoking sessions at the highest service seam", async () => {
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Enable,
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Disable,
    })).resolves.toBe(true);

    expect(await fixture.readAccessState()).toBe("disabled");
    expect(await claimRepairBacklog(fixture.store)).toEqual([]);
    expect(fixture.sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);
  });

  test("keeps a committed disable blocking after finalize failure and lets indexed repair converge", async () => {
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Enable,
      failNextFinalize: true,
      authorityState: {
        accountState: "disabled",
        factsState: "not_current",
      },
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Disable,
    })).resolves.toBe(true);

    expect(await fixture.readAccessState()).toBe("blocking");
    await expect(fixture.repair.repairPending({ limit: 10 })).resolves.toMatchObject({
      disabled: 1,
      failed: 0,
    });
    expect(await fixture.readAccessState()).toBe("disabled");
  });

  test("keeps re-enabled access blocked until current Facts repair and never recreates old sessions", async () => {
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Disable,
      authorityState: {
        accountState: "enabled",
        factsState: "current",
      },
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Enable,
    })).resolves.toBe(true);

    expect(await fixture.readAccessState()).toBe("blocking");
    expect(fixture.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
    await expect(fixture.repair.repairSubject(
      "00000000-0000-4000-8000-000000000001",
    )).resolves.toEqual({ status: "enabled" });
    expect(await fixture.readAccessState()).toBe("enabled");
    expect(fixture.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("runs disable and re-enable through one highest-level mutation lifecycle before repair converges", async () => {
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Enable,
      stateful: true,
      authorityState: {
        accountState: "enabled",
        factsState: "current",
      },
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Disable,
    })).resolves.toBe(true);
    expect(await fixture.readAccessState()).toBe("disabled");
    expect(fixture.sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Enable,
    })).resolves.toBe(true);
    expect(await fixture.readAccessState()).toBe("blocking");
    expect(fixture.sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);

    await expect(fixture.repair.repairSubject(
      "00000000-0000-4000-8000-000000000001",
    )).resolves.toEqual({ status: "enabled" });
    expect(await fixture.readAccessState()).toBe("enabled");
    expect(fixture.sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);
  });

  test("restores enabled access for a same-enabled write using transaction-authoritative state", async () => {
    const fixture = createLifecycleService({
      initialStatus: UserStatus.Enable,
      rootStatus: UserStatus.Disable,
      transactionStatus: UserStatus.Enable,
    });

    await expect(fixture.service.updateUser("zhangsan", {
      status: UserStatus.Enable,
    })).resolves.toBe(true);

    expect(await fixture.readAccessState()).toBe("enabled");
    expect(await claimRepairBacklog(fixture.store)).toEqual([]);
    expect(fixture.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("keeps a new enabled user inaccessible until its first current Facts publication repair", async () => {
    const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
    const store = createInMemorySubjectAccessStore();
    const barrier = createSubjectAccessBarrier({
      store,
      clock: { nowDate: () => new Date("2026-01-01T00:05:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });
    const lifecycle = createSubjectAccessLifecycle({
      barrier,
      logger: { warn: mock(() => undefined) },
      ...createTransitionLifecycleOptions(),
    });
    const createdUser = user({ subjectIdentifier });
    const tx = {
      auditService: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userRepository: {
        getUserByUsernameForAdmin: mock(async () => null),
        setUserForAdmin: mock(async () => createdUser),
      },
    };
    const service = createUserService({
      employmentRepository: {
        getAllEmploymentsByUserIdForAdmin: mock(async () => []),
      },
      passwordHasher: createFakePasswordHasher(),
      privilegeRepository: { getPrivilegesByRoleIds: mock(async () => []) },
      random: createFakeRandom(),
      roleAssignmentResolver: { resolveEffectiveRoles: mock(async () => new Map()) },
      sessionRevocation: { revokeUserSessions: mock(async () => revokeSummary()) },
      subjectAccessLifecycle: lifecycle,
      uow: createImmediateUnitOfWork(tx),
      userRepository: {
        getUserByUsernameForAdmin: mock(async () => null),
        searchUsersFuzzyPaged: mock(async () => ({ rows: [], total: 0 })),
      },
    } as any);

    await service.setUserForAdmin({
      username: "zhangsan",
      name: "张三",
      userType: UserType.Formal,
    });

    expect(await readStoreState(store, subjectIdentifier)).toBe("blocking");
    const repair = createSubjectAccessRepair({
      barrier,
      backlog: store,
      authority: {
        resolve: mock(async () => ({
          accountState: "enabled" as const,
          factsState: "current" as const,
        })),
      },
      logger: { warn: mock(() => undefined) },
      random: { uuid: () => "30000000-0000-4000-8000-000000000001" },
    });
    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "enabled",
    });
    expect(await readStoreState(store, subjectIdentifier)).toBe("enabled");
  });
});

function createLifecycleService(options: {
  initialStatus: UserStatus;
  rootStatus?: UserStatus;
  transactionStatus?: UserStatus;
  updateUserByUsername?: ReturnType<typeof mock>;
  failNextFinalize?: boolean;
  authorityState?: {
    accountState: "enabled" | "disabled";
    factsState: "current" | "not_current";
  };
  stateful?: boolean;
}) {
  const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
  const store = createInMemorySubjectAccessStore([{
    version: 1,
    subjectIdentifier,
    state: options.initialStatus === UserStatus.Enable ? "enabled" : "disabled",
    transitionId: "20000000-0000-4000-8000-000000000001",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }], { clock: { now: () => subjectAccessNow } });
  const barrier = createSubjectAccessBarrier({
    store,
    clock: { nowDate: () => new Date("2026-01-01T00:05:00.000Z") },
    random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
  });
  let failFinalize = options.failNextFinalize ?? false;
  const lifecycle = createSubjectAccessLifecycle({
    barrier: {
      abortBegin: barrier.abortBegin,
      beginBlocking: barrier.beginBlocking,
      prepareRepair: barrier.prepareRepair,
      rollback: barrier.rollback,
      async finalize(transition, targetState) {
        if (failFinalize) {
          failFinalize = false;
          throw new Error("redis finalize unavailable");
        }
        await barrier.finalize(transition, targetState);
      },
    },
    logger: { warn: mock(() => undefined) },
    ...createTransitionLifecycleOptions(),
  });
  let currentStatus = options.initialStatus;
  const existingUser = user({ status: options.transactionStatus ?? options.initialStatus });
  const rootUser = user({ status: options.rootStatus ?? options.initialStatus });
  const updateUserByUsername = options.updateUserByUsername
    ?? mock(async (_username: string, input: Record<string, unknown>) => {
      if (options.stateful && typeof input.status === "number")
        currentStatus = input.status;
      return user(input);
    });
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    subjectAccessMutation: createSubjectAccessMutation(),
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    userRepository: {
      getUserByUsernameForAdmin: mock(async () =>
        options.stateful ? user({ status: currentStatus }) : existingUser),
      updateUserByUsername,
    },
  };
  const sessionRevocation = {
    revokeUserSessions: mock(async () => revokeSummary()),
  };
  const service = createUserService({
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
    sessionRevocation,
    subjectAccessLifecycle: lifecycle,
    uow: createImmediateUnitOfWork(tx),
    userRepository: {
      getUserByUsernameForAdmin: mock(async () =>
        options.stateful ? user({ status: currentStatus }) : rootUser),
      searchUsersFuzzyPaged: mock(async () => ({ rows: [], total: 0 })),
    },
  } as any);
  const repair = createSubjectAccessRepair({
    barrier,
    backlog: store,
    authority: {
      resolve: mock(async () => options.authorityState ?? ({
        accountState: "enabled" as const,
        factsState: "current" as const,
      })),
    },
    logger: { warn: mock(() => undefined) },
    random: { uuid: () => "30000000-0000-4000-8000-000000000001" },
  });

  return {
    barrier,
    repair,
    service,
    sessionRevocation,
    store,
    async readAccessState() {
      const serialized = await store.read(subjectIdentifier);
      return serialized === null
        ? null
        : SubjectAccessRecordV1Schema.parse(JSON.parse(serialized)).state;
    },
  };
}

async function readStoreState(
  store: ReturnType<typeof createInMemorySubjectAccessStore>,
  subjectIdentifier: string,
) {
  const serialized = await store.read(subjectIdentifier);
  return serialized === null
    ? null
    : SubjectAccessRecordV1Schema.parse(JSON.parse(serialized)).state;
}
