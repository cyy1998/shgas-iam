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
    userDelegationQuery: { searchUsersWithDelegations: mock(async () => ({ users: [], delegations: [] })) },
    userDetailBuilder: { buildUserDetail: mock(async () => user) },
    userRepository: {
      getUserById: mock(async () => user),
      getUserByMobile: mock(async () => user),
      getUserByUsername: mock(async () => user),
      getUserByWxId: mock(async () => user),
      searchUsers: mock(async () => [user]),
      updateEnabledUserStatus: mock(async () => user),
    },
    ...overrides,
  } as any;
}

describe("createUserService", () => {
  test("changes password inside a unit of work", async () => {
    const deps = createDeps();
    const service = createUserService(deps);

    await expect(service.setPassword("zhangsan", "oldPass123", "newPass123")).resolves.toBe(true);
    expect(deps.passwordHelper.hashUserPassword).toHaveBeenCalledWith("newPass123");
  });

  test("rejects reset password when mobile does not match", async () => {
    const service = createUserService(createDeps());

    await expect(service.resetPassword("zhangsan", "13900000000", "1234", "newPass123"))
      .rejects
      .toThrow("用户名与手机号不匹配");
  });
});
