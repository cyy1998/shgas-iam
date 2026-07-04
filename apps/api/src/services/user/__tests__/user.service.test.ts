import { createImmediateUnitOfWork } from "@api/testing/fakes";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserService } from "../user.service";

function createDeps(overrides: Record<string, unknown> = {}) {
  const resetPasswordReservation = { usage: "resetPassword", phone: "13800000000", token: "reset-token" };
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
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    mobileBinding: { assertCanBindMobile: mock(async () => bindPhoneReservation) },
    mobileService: {
      checkExistingPhoneNumber: mock(async () => false),
      checkValidPhoneNumber: mock(() => true),
      consumeVerificationCode: mock(async () => true),
      reserveVerificationCode: mock(async () => resetPasswordReservation),
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
    resetPasswordReservation,
    ...overrides,
  } as any;
}

describe("createUserService", () => {
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

  test("rejects reset password when mobile does not match", async () => {
    const service = createUserService(createDeps());

    await expect(service.resetPassword("zhangsan", "13900000000", "1234", "newPass123"))
      .rejects
      .toThrow("用户名与手机号不匹配");
  });

  test("resets password without marking profile dirty", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.resetPassword("zhangsan", "13800000000", "1234", "newPass123")).resolves.toBe(true);

    expect(deps.tx.userRepository.setPassword).toHaveBeenCalledWith(1, "hashed:newPass123");
    expect(deps.mobileService.confirmReservedVerificationCode).toHaveBeenCalledWith(deps.resetPasswordReservation);
    expect(deps.mobileService.releaseReservedVerificationCode).not.toHaveBeenCalled();
    expect(deps.tx.profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
  });

  test("releases reset password verification reservation when transaction fails", async () => {
    const deps = createDeps();
    const service = createUserService(deps);
    deps.tx.userRepository.setPassword.mockRejectedValue(new Error("db failed"));

    await expect(service.resetPassword("zhangsan", "13800000000", "1234", "newPass123")).rejects.toThrow("db failed");

    expect(deps.mobileService.confirmReservedVerificationCode).not.toHaveBeenCalled();
    expect(deps.mobileService.releaseReservedVerificationCode).toHaveBeenCalledWith(deps.resetPasswordReservation);
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
