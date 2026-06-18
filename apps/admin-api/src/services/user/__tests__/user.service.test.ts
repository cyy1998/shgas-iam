import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { UserStatus, UserType } from "@iam/contracts";
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

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
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
    tokenRevocation: {
      revokeUserTokens: mock(async () => undefined),
    },
    uow: createImmediateUnitOfWork(tx),
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

  test("revokes user tokens when disabling a user", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.updateUser("zhangsan", { status: UserStatus.Disable })).resolves.toBe(true);

    expect(tx.userRepository.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(deps.tokenRevocation.revokeUserTokens).toHaveBeenCalledWith(1);
  });

  test("rejects deleting a user with active employments", async () => {
    const { service, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());
    tx.userRepository.countActiveEmploymentsByUsername.mockResolvedValue(1);

    await expect(service.deleteUser("zhangsan")).rejects.toThrow();

    expect(tx.userRepository.softDeleteUserByUsername).not.toHaveBeenCalled();
  });

  test("resets a user password with the injected random password", async () => {
    const { service, deps, tx } = createService();
    (tx.userRepository.getUserByUsernameForAdmin as any).mockResolvedValue(user());

    await expect(service.resetPasswordByUsername("zhangsan")).resolves.toBe("Rand1234");

    expect(deps.passwordHasher.hashPassword).toHaveBeenCalledWith("Rand1234");
    expect(tx.userRepository.setPassword).toHaveBeenCalledWith(1, "hashed:Rand1234");
  });
});
