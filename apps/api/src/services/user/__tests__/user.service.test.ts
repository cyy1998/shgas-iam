import { createApiPasswordHasher } from "@api/composition/runtime/password-hasher";
import { createImmediateUnitOfWork } from "@api/testing/fakes";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { UserPasswordUnchangedError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";
import { createUserPasswordHelper } from "../user-password.helper";
import { createUserService } from "../user.service";

const EXISTING_BCRYPT_TS_8_HASH = "$2b$04$ZwwFh9CSK/owUc7IdLKdFOPiqfxmljguVbVqfGRZq8J9tkkdrcxH2";

function createDeps(overrides: Record<string, unknown> = {}) {
  const bindPhoneReservation = { usage: "bindPhone", phone: "13900000000", token: "bind-token" };
  const user = {
    id: 1,
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
    userRepository: {
      getUserByUsername: mock(async () => user),
      setMobile: mock(async () => user),
      setPassword: mock(async () => user),
      updateEnabledUserStatus: mock(async () => user),
    },
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    profileDirtyMarker: {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [1] })),
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
    uow: createImmediateUnitOfWork(tx),
    tx,
    user,
    userDelegationQuery: { searchUsersWithDelegations: mock(async () => ({ users: [], delegations: [] })) },
    profileQuery: {
      getDetailByMobile: mock(async () => user),
      getDetailByUserId: mock(async () => user),
      getDetailByUsername: mock(async () => user),
      getDetailByWxId: mock(async () => user),
      searchLegacyUsers: mock(async () => [user]),
    },
    userRepository: {
      getUserById: mock(async () => user),
      getUserByMobile: mock(async () => user),
      getUserByUsername: mock(async () => user),
      getUserByWxId: mock(async () => user),
    },
    bindPhoneReservation,
    ...overrides,
  } as any;
}

describe("createUserService", () => {
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
    expect(deps.tx.profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
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
    expect(deps.tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
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
    expect(deps.tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
  });

  test("delegates user detail and legacy search reads to profile query service", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await service.getUserDetailByUsername("zhangsan");
    await service.searchUsers({ usernames: ["zhangsan"] });

    expect(deps.profileQuery.getDetailByUsername).toHaveBeenCalledWith("zhangsan");
    expect(deps.profileQuery.searchLegacyUsers).toHaveBeenCalledWith({ usernames: ["zhangsan"] });
  });
});
