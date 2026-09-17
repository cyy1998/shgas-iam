import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { createApiPasswordHasher } from "@api/composition/runtime/password-hasher";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import { createImmediateUnitOfWork } from "@api/testing/fakes";
import { UserStatus } from "@iam/contracts";
import { UserNotFoundError, UserPasswordUnchangedError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";

const EXISTING_BCRYPT_TS_8_HASH = "$2b$04$ZwwFh9CSK/owUc7IdLKdFOPiqfxmljguVbVqfGRZq8J9tkkdrcxH2";
const subjectAccessMutationReceipt: SubjectAccessMutationReceipt = {
  subjectIdentifier: "11111111-1111-4111-8111-111111111111",
  transitionId: "20000000-0000-4000-8000-000000000002",
  ownerToken: "20000000-0000-4000-8000-000000000003",
};

function createDeps(overrides: Record<string, unknown> = {}) {
  const bindPhoneReservation = { usage: "bindPhone", phone: "13900000000", token: "bind-token" };
  const user = {
    id: 1,
    subjectIdentifier: "11111111-1111-4111-8111-111111111111",
    username: "zhangsan",
    name: "张三",
    userType: "employee",
    password: "hashed:oldPass123",
    mobile: "13800000000",
    wxId: null,
    status: "enable",
    orderNum: 0,
    isDelete: false,
    createTime: new Date(),
    updateTime: new Date(),
  };
  const tx = {
    subjectAccessMutation: {
      runMutation: async <T>(
        _receipt: SubjectAccessMutationReceipt,
        mutation: () => Promise<T>,
      ) => await mutation(),
    },
    userRepository: {
      getUserByUsername: mock(async () => user),
      setMobile: mock(async () => user),
      setPassword: mock(async () => user),
      updateEnabledUserStatus: mock(async () => user),
    },
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
  };
  return {
    mobileBinding: { assertCanBindMobile: mock(async () => bindPhoneReservation) },
    mobileService: {
      checkExistingPhoneNumber: mock(async () => false),
      checkValidPhoneNumber: mock(() => true),
      consumeVerificationCode: mock(async () => true),
      confirmReservedVerificationCode: mock(async () => true),
      releaseReservedVerificationCode: mock(async () => undefined),
    },
    passwordHelper: {
      assertStrongPassword: mock(() => undefined),
      hashUserPassword: mock(async (password: string) => `hashed:${password}`),
      verifyUserPassword: mock(async (_user: unknown, password: string) => password === "oldPass123"),
    },
    sessionRevocation: {
      revokeUserSessions: mock(async () => undefined),
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
      }) => {
        const result = await input.mutate(subjectAccessMutationReceipt);
        await input.revokeSessions?.(result, {
          invalidatedSubjectAccessTransitionId:
            "20000000-0000-4000-8000-000000000001",
        });
        return result;
      }),
    },
    uow: createImmediateUnitOfWork(tx),
    tx,
    user,
    profileQuery: {
      getDetailByMobile: mock(async () => user),
      getDetailByUserId: mock(async () => user),
      getDetailByUsername: mock(async () => user),
      getDetailByWxId: mock(async () => user),
      searchLegacyUsers: mock(async () => [user]),
    },
    userRepository: {
      getUserById: mock(async () => user),
      findUserIdentityByUsername: mock(async () => ({ id: user.id })),
      findUserIdentityBySubjectIdentifier: mock(async () => ({ id: user.id })),
      getUserByMobile: mock(async () => user),
      getUserByUsername: mock(async () => user),
      getUserByWxId: mock(async () => user),
    },
    bindPhoneReservation,
    ...overrides,
  } as any;
}

describe("createUserService", () => {
  test.each(["13800000000", null])("returns only the published mobile for account recovery: %s", async (mobile) => {
    const deps = createDeps();
    deps.profileQuery.getDetailByUsername.mockResolvedValue({ ...deps.user, mobile });
    const result = await createUserService(deps).getUserMobileByUsername("zhangsan");
    expect(result).toBe(mobile);
  });

  test("returns null only when a missing Profile belongs to an absent account", async () => {
    const deps = createDeps();
    deps.profileQuery.getDetailByUsername.mockRejectedValue(new UserNotFoundError("用户画像不存在"));
    deps.userRepository.findUserIdentityByUsername.mockResolvedValue(null);
    const result = await createUserService(deps).getUserMobileByUsername("unknown");
    expect(result).toBeNull();
    expect(deps.userRepository.findUserIdentityByUsername).toHaveBeenCalledWith("unknown");
  });

  test.each([new UserNotFoundError("用户画像不存在"), new Error("database unavailable")])(
    "preserves Profile failures for an existing account: %s",
    async (error) => {
      const deps = createDeps();
      deps.profileQuery.getDetailByUsername.mockRejectedValue(error);
      let failure: unknown;
      try {
        await createUserService(deps).getUserMobileByUsername("zhangsan");
      }
      catch (caught) {
        failure = caught;
      }
      expect(failure).toBe(error);
    },
  );

  test("reads permitted ORCAS fields from profile detail and excludes unrelated fields", async () => {
    const deps = createDeps();
    deps.profileQuery.getDetailByUserId.mockResolvedValue({
      ...deps.user,
      username: "profile-username",
      name: "档案姓名",
      mobile: "13900000000",
      status: UserStatus.Disable,
      isDelete: true,
      roles: [{ code: "private-role" }],
    });
    const result = await createUserService(deps).findOrcasUserBySubjectIdentifier(deps.user.subjectIdentifier);

    expect(result).toEqual({ id: 1, username: "profile-username", name: "档案姓名", mobile: "13900000000" });
    expect(deps.userRepository.findUserIdentityBySubjectIdentifier).toHaveBeenCalledWith(deps.user.subjectIdentifier);
    expect(deps.profileQuery.getDetailByUserId).toHaveBeenCalledWith(1);
    expect(deps.userRepository.getUserById).not.toHaveBeenCalled();
  });

  test("omits absent ORCAS mobile and returns null for an unknown subject", async () => {
    const deps = createDeps();
    deps.profileQuery.getDetailByUserId.mockResolvedValue({ ...deps.user, mobile: null });
    const service = createUserService(deps);
    const result = await service.findOrcasUserBySubjectIdentifier(deps.user.subjectIdentifier);
    expect(result).toEqual({ id: 1, username: "zhangsan", name: "张三" });

    deps.userRepository.findUserIdentityBySubjectIdentifier.mockResolvedValue(null);
    deps.profileQuery.getDetailByUserId.mockClear();
    const missing = await service.findOrcasUserBySubjectIdentifier("unknown");
    expect(missing).toBeNull();
    expect(deps.profileQuery.getDetailByUserId).not.toHaveBeenCalled();
  });

  test("reports unavailable ORCAS Profile details as missing while identity lookup failures propagate", async () => {
    for (const error of [new Error("profile missing"), new Error("profile unavailable")]) {
      const deps = createDeps();
      deps.profileQuery.getDetailByUserId.mockRejectedValue(error);
      const result = await createUserService(deps).findOrcasUserBySubjectIdentifier(deps.user.subjectIdentifier);
      expect(result).toBeNull();
    }
    const deps = createDeps();
    const error = new Error("identity lookup unavailable");
    deps.userRepository.findUserIdentityBySubjectIdentifier.mockRejectedValue(error);
    let failure: unknown;
    try {
      await createUserService(deps).findOrcasUserBySubjectIdentifier(deps.user.subjectIdentifier);
    }
    catch (caught) {
      failure = caught;
    }
    expect(failure).toBe(error);
    expect(deps.profileQuery.getDetailByUserId).not.toHaveBeenCalled();
  });

  test("changes an existing bcrypt password through the production runtime hasher", async () => {
    const deps = createDeps();
    deps.user.password = EXISTING_BCRYPT_TS_8_HASH;
    deps.passwordHelper = createUserPasswordHelper({
      passwordHasher: createApiPasswordHasher(4),
    });
    deps.tx.userRepository.setPassword.mockImplementation(async (_userId: number, password: string) => {
      deps.user.password = password;
      return deps.user;
    });
    const service = createUserService(deps);

    await expect(service.checkPassword("zhangsan", "Existing123!")).resolves.toBe(true);
    await expect(service.checkPassword("zhangsan", "Wrong123!")).resolves.toBe(false);
    await expect(service.setPassword("zhangsan", "Existing123!", "NewSecret123!")).resolves.toBe(true);
    await expect(service.checkPassword("zhangsan", "NewSecret123!")).resolves.toBe(true);
    await expect(service.checkPassword("zhangsan", "Existing123!")).resolves.toBe(false);
  });

  test("changes password inside a unit of work", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.setPassword("zhangsan", "oldPass123", "newPass123", {
      requestContext: {
        sourceApp: "iam",
        requestId: "req-public",
        traceId: "11111111111111111111111111111111",
        ip: "203.0.113.10",
        userAgent: "user-service-test",
        route: "/public/password/change",
        method: "POST",
      },
    })).resolves.toBe(true);
    expect(deps.passwordHelper.hashUserPassword).toHaveBeenCalledWith("newPass123");
    expect(deps.tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "self.password.change",
      outcome: "success",
      requestId: "req-public",
      traceId: "11111111111111111111111111111111",
    }));
    expect(deps.tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rejects unchanged password with domain bad request error", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.setPassword("zhangsan", "oldPass123", "oldPass123"))
      .rejects
      .toBeInstanceOf(UserPasswordUnchangedError);
    expect(deps.tx.userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("sets mobile without reading profile detail after mutation", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.setMobile(1, "13900000000", "1234")).resolves.toBe(true);

    expect(deps.profileQuery.getDetailByUserId).not.toHaveBeenCalled();
    expect(deps.mobileService.confirmReservedVerificationCode).toHaveBeenCalledWith(deps.bindPhoneReservation);
    expect(deps.mobileService.releaseReservedVerificationCode).not.toHaveBeenCalled();
    expect(deps.tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
    ]);
  });

  test("releases mobile binding verification reservation when transaction fails", async () => {
    const deps = createDeps();
    const service = createUserService(deps);
    deps.tx.userRepository.setMobile.mockRejectedValue(new Error("db failed"));

    await expect(service.setMobile(1, "13900000000", "1234")).rejects.toThrow("db failed");

    expect(deps.mobileService.confirmReservedVerificationCode).not.toHaveBeenCalled();
    expect(deps.mobileService.releaseReservedVerificationCode).toHaveBeenCalledWith(deps.bindPhoneReservation);
  });

  test("marks profile dirty when pausing an enabled user", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.pauseEnabledUser(1)).resolves.toMatchObject({ id: 1 });

    expect(deps.tx.userRepository.updateEnabledUserStatus).toHaveBeenCalledWith(1, UserStatus.Pause);
    expect(deps.tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
    ]);
    expect(deps.subjectAccessLifecycle.run).toHaveBeenCalledWith(expect.objectContaining({
      subjectIdentifier: deps.user.subjectIdentifier,
      disposition: "disabled",
    }));
    expect(deps.sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      subjectIdentifier: deps.user.subjectIdentifier,
      reason: "user_disabled",
      onlySubjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
    });
  });

  test("does not mutate when Subject Access cannot pre-block a pause", async () => {
    const barrierError = new Error("subject access unavailable");
    const deps = createDeps({
      subjectAccessLifecycle: {
        run: mock(async () => {
          throw barrierError;
        }),
      },
    });
    const service = createUserService(deps);

    await expect(service.pauseEnabledUser(1)).rejects.toBe(barrierError);

    expect(deps.tx.userRepository.updateEnabledUserStatus).not.toHaveBeenCalled();
    expect(deps.tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("delegates user detail reads to profile query service", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await service.getUserDetailByUsername("zhangsan");

    expect(deps.profileQuery.getDetailByUsername).toHaveBeenCalledWith("zhangsan");
  });
});
