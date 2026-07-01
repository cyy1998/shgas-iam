import { createImmediateUnitOfWork } from "@api/testing/fakes";
import { describe, expect, mock, test } from "bun:test";
import { createUserService } from "../user.service";

function createDeps(overrides: Record<string, unknown> = {}) {
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
    },
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
  };
  return {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    mobileBinding: { assertCanBindMobile: mock(async () => undefined) },
    mobileService: {
      checkExistingPhoneNumber: mock(async () => false),
      checkValidPhoneNumber: mock(() => true),
      consumeVerificationCode: mock(async () => true),
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
      updateEnabledUserStatus: mock(async () => user),
    },
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
  });

  test("rejects reset password when mobile does not match", async () => {
    const service = createUserService(createDeps());

    await expect(service.resetPassword("zhangsan", "13900000000", "1234", "newPass123"))
      .rejects
      .toThrow("用户名与手机号不匹配");
  });

  test("sets mobile without reading profile detail after mutation", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.setMobile(1, "13900000000", "1234")).resolves.toBe(true);

    expect(deps.profileQuery.getDetailByUserId).not.toHaveBeenCalled();
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
