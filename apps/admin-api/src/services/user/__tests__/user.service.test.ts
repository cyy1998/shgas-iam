import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  PrivilegeStatus,
  RoleStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const tx = { name: "admin-user-service-test-tx" };
const transaction = mock(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));

const config = {
  PASSWORD_HASH_ROUNDS: 4,
};

const hash = mock(async (password: string, rounds: number) => `hashed:${password}:${rounds}`);
const generateRandomPassword = mock(() => "Rand1234");

const userRepository = {
  countActiveEmploymentsByUsername: mock(),
  getUserByUsernameForAdmin: mock(),
  searchUsersFuzzyPaged: mock(),
  setPassword: mock(),
  setUserForAdmin: mock(),
  softDeleteUserByUsername: mock(),
  updateUserByUsername: mock(),
};

const employmentRepository = {
  createEmploymentRecord: mock(),
  endActiveEmploymentsByUserId: mock(),
  getAllEmploymentsByUserIdForAdmin: mock(),
  getEmploymentByIdForAdmin: mock(),
  getEmploymentByUserOrgPosId: mock(),
  getEmploymentsByUserId: mock(),
  softDeleteEmployment: mock(),
  unsetPrimariesByUserId: mock(),
  updateEmploymentRecord: mock(),
};

const roleRepository = {
  getRolesByEmploymentId: mock(),
};

const privilegeRepository = {
  getPrivilegesByRoleIds: mock(),
};

const auditService = {
  recordAuditLog: mock(),
};

Reflect.set(globalThis, "__adminUserRepositoryMock", userRepository);
Reflect.set(globalThis, "__adminEmploymentRepositoryMock", employmentRepository);
Reflect.set(globalThis, "__adminRoleRepositoryMock", roleRepository);
Reflect.set(globalThis, "__adminPrivilegeRepositoryMock", privilegeRepository);

mock.module("@admin-api/env", () => ({
  default: config,
}));

mock.module("@iam/db", () => ({
  default: {
    transaction,
  },
}));

mock.module("bcrypt-ts", () => ({
  hash,
}));

mock.module("@iam/api-core/utils", () => ({
  generateRandomPassword,
}));

mock.module("@admin-api/services/user/user.repository", () => userRepository);
mock.module("@admin-api/services/employment/employment.repository", () => employmentRepository);
mock.module("@admin-api/services/role/role.repository", () => roleRepository);
mock.module("@admin-api/services/privilege/privilege.repository", () => privilegeRepository);
mock.module("@admin-api/services/audit/audit.service", () => auditService);

const userService = await import("../user.service");

afterAll(() => {
  mock.restore();
});

const fixedDate = new Date("2026-01-01T00:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    username: "zhangsan",
    wxId: null,
    name: "张三",
    password: "old-hash",
    mobile: "17721462865",
    userType: UserType.Formal,
    orderNum: 1,
    status: UserStatus.Enable,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    ...overrides,
  };
}

function makeOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: 2001,
    orgCode: "ORG001",
    orgName: "信息中心",
    parentId: -1,
    businessParentId: -1,
    path: "ORG001",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
    orderNum: 1,
    isVirtual: false,
    isEntity: false,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    ...overrides,
  };
}

function makePosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 3001,
    posCode: "POS001",
    posName: "工程师",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    ...overrides,
  };
}

function makeEmployment(overrides: Record<string, unknown> = {}) {
  const company = makeOrganization({
    id: 2002,
    orgCode: "COMP001",
    orgName: "上海燃气",
    orgType: OrganizationType.Company,
    level: OrganizationLevel.One,
  });
  const assignedOrg = makeOrganization();
  return {
    id: 4001,
    userId: 1001,
    posId: 3001,
    orgId: 2001,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: fixedDate,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    user: makeUser(),
    organization: {
      assignedOrg: { ...assignedOrg, pathIndex: 1, distanceToAssignedOrg: 0 },
      fullOrgPath: [
        { ...company, pathIndex: 0, distanceToAssignedOrg: 1 },
        { ...assignedOrg, pathIndex: 1, distanceToAssignedOrg: 0 },
      ],
      companyNodes: [{ ...company, pathIndex: 0, distanceToAssignedOrg: 1 }],
    },
    position: makePosition(),
    ...overrides,
  };
}

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 5001,
    roleCode: "role:default",
    roleName: "默认角色",
    clientId: 1,
    status: RoleStatus.Enable,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    ...overrides,
  };
}

function makePrivilege(overrides: Record<string, unknown> = {}) {
  return {
    id: 6001,
    privilegeCode: "priv:read",
    privilegeName: "读取权限",
    fieldValues: null,
    status: PrivilegeStatus.Enable,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    ...overrides,
  };
}

beforeEach(() => {
  transaction.mockClear();
  hash.mockClear();
  generateRandomPassword.mockClear();

  userRepository.countActiveEmploymentsByUsername.mockReset();
  userRepository.getUserByUsernameForAdmin.mockReset();
  userRepository.searchUsersFuzzyPaged.mockReset();
  userRepository.setPassword.mockReset();
  userRepository.setUserForAdmin.mockReset();
  userRepository.softDeleteUserByUsername.mockReset();
  userRepository.updateUserByUsername.mockReset();
  employmentRepository.getAllEmploymentsByUserIdForAdmin.mockReset();
  employmentRepository.getEmploymentsByUserId.mockReset();
  roleRepository.getRolesByEmploymentId.mockReset();
  privilegeRepository.getPrivilegesByRoleIds.mockReset();
  auditService.recordAuditLog.mockReset();

  userRepository.getUserByUsernameForAdmin.mockResolvedValue(makeUser());
  userRepository.searchUsersFuzzyPaged.mockResolvedValue({ rows: [makeUser()], total: 1 });
  userRepository.setUserForAdmin.mockResolvedValue(makeUser());
  userRepository.updateUserByUsername.mockResolvedValue(makeUser());
  userRepository.countActiveEmploymentsByUsername.mockResolvedValue(0);
  userRepository.softDeleteUserByUsername.mockResolvedValue(makeUser({ isDelete: true }));
  userRepository.setPassword.mockResolvedValue(makeUser({ password: "new-hash" }));
  employmentRepository.getAllEmploymentsByUserIdForAdmin.mockResolvedValue([]);
  employmentRepository.getEmploymentsByUserId.mockResolvedValue([]);
  roleRepository.getRolesByEmploymentId.mockResolvedValue([]);
  privilegeRepository.getPrivilegesByRoleIds.mockResolvedValue([]);
  auditService.recordAuditLog.mockResolvedValue(undefined);
});

describe("admin userService.setUserForAdmin", () => {
  test("rejects duplicate usernames", async () => {
    await expect(
      userService.setUserForAdmin({
        username: "zhangsan",
        name: "张三",
        userType: UserType.Formal,
      }),
    ).rejects.toThrow("用户名已存在");

    expect(userRepository.setUserForAdmin).not.toHaveBeenCalled();
  });

  test("hashes provided passwords and returns generatedPassword null", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(
      userService.setUserForAdmin({
        username: "zhangsan",
        name: "张三",
        userType: UserType.Formal,
        password: "Provided1",
        mobile: "17721462865",
        wxId: "wx-1",
        status: UserStatus.Pause,
        orderNum: 8,
      }),
    ).resolves.toEqual({
      username: "zhangsan",
      generatedPassword: null,
    });

    expect(generateRandomPassword).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledWith("Provided1", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setUserForAdmin).toHaveBeenCalledWith(
      {
        username: "zhangsan",
        name: "张三",
        userType: UserType.Formal,
        password: "hashed:Provided1:4",
        mobile: "17721462865",
        wxId: "wx-1",
        status: UserStatus.Pause,
        orderNum: 8,
      },
      tx,
    );
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.create",
      outcome: "success",
      actorType: "system",
      targetType: "user",
      targetCode: "zhangsan",
      details: expect.objectContaining({
        passwordProvided: true,
      }),
    }), tx);
  });

  test("generates a password and applies create defaults when password and optional fields are omitted", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(
      userService.setUserForAdmin({
        username: "lisi",
        name: "李四",
        userType: UserType.External,
      }),
    ).resolves.toEqual({
      username: "lisi",
      generatedPassword: "Rand1234",
    });

    expect(generateRandomPassword).toHaveBeenCalledWith(8);
    expect(hash).toHaveBeenCalledWith("Rand1234", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setUserForAdmin).toHaveBeenCalledWith(
      {
        username: "lisi",
        name: "李四",
        userType: UserType.External,
        password: "hashed:Rand1234:4",
        mobile: null,
        wxId: null,
        status: UserStatus.Enable,
        orderNum: 0,
      },
      tx,
    );
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.create",
      details: expect.objectContaining({
        passwordProvided: false,
      }),
    }), tx);
  });
});

describe("admin userService.updateUser", () => {
  test("rejects missing users", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(userService.updateUser("missing", { name: "新名字" })).rejects.toThrow("用户不存在");

    expect(userRepository.updateUserByUsername).not.toHaveBeenCalled();
  });

  test("updates existing users in the transaction", async () => {
    const data = { name: "新名字", status: UserStatus.Pause };

    await expect(userService.updateUser("zhangsan", data)).resolves.toBe(true);

    expect(userRepository.updateUserByUsername).toHaveBeenCalledWith("zhangsan", data, tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.update",
      details: expect.objectContaining({
        patch: data,
      }),
    }), tx);
  });

  test("updates user status through updateUser", async () => {
    await expect(userService.updateUserStatus("zhangsan", UserStatus.Disable)).resolves.toBe(true);

    expect(userRepository.updateUserByUsername).toHaveBeenCalledWith(
      "zhangsan",
      { status: UserStatus.Disable },
      tx,
    );
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.status_update",
      details: expect.objectContaining({
        patch: { status: UserStatus.Disable },
      }),
    }), tx);
  });
});

describe("admin userService.deleteUser", () => {
  test("rejects missing users", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(userService.deleteUser("missing")).rejects.toThrow("用户不存在");

    expect(userRepository.countActiveEmploymentsByUsername).not.toHaveBeenCalled();
  });

  test("rejects users with active employments", async () => {
    userRepository.countActiveEmploymentsByUsername.mockResolvedValue(1);

    await expect(userService.deleteUser("zhangsan")).rejects.toThrow();

    expect(userRepository.countActiveEmploymentsByUsername).toHaveBeenCalledWith("zhangsan", tx);
    expect(userRepository.softDeleteUserByUsername).not.toHaveBeenCalled();
  });

  test("soft deletes users without active employments", async () => {
    await expect(userService.deleteUser("zhangsan")).resolves.toBe(true);

    expect(userRepository.countActiveEmploymentsByUsername).toHaveBeenCalledWith("zhangsan", tx);
    expect(userRepository.softDeleteUserByUsername).toHaveBeenCalledWith("zhangsan", tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.delete",
      details: expect.objectContaining({
        deleted: true,
      }),
    }), tx);
  });
});

describe("admin userService.resetPasswordByUsername", () => {
  test("rejects missing users", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(userService.resetPasswordByUsername("missing")).rejects.toThrow("用户不存在");

    expect(generateRandomPassword).not.toHaveBeenCalled();
  });

  test("generates, hashes, saves, and returns the new plain password", async () => {
    await expect(userService.resetPasswordByUsername("zhangsan")).resolves.toBe("Rand1234");

    expect(generateRandomPassword).toHaveBeenCalledWith(8);
    expect(hash).toHaveBeenCalledWith("Rand1234", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setPassword).toHaveBeenCalledWith(1001, "hashed:Rand1234:4", tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.reset_password",
      details: expect.objectContaining({
        passwordReset: true,
      }),
    }), tx);
  });
});

describe("admin userService.searchUsersFuzzyForAdmin", () => {
  test("maps rows and returns zero pages when total is zero", async () => {
    const query = {
      conditions: {
        fuzzyConditions: {},
        exactConditions: {},
      },
      pageNum: 1,
      pageSize: 10,
    };
    userRepository.searchUsersFuzzyPaged.mockResolvedValue({ rows: [], total: 0 });

    await expect(userService.searchUsersFuzzyForAdmin(query)).resolves.toEqual({
      result: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
      pages: 0,
    });
  });

  test("maps rows and calculates pages from total and pageSize", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "zhang" },
        exactConditions: { statuses: [UserStatus.Enable] },
      },
      pageNum: 2,
      pageSize: 10,
    };
    userRepository.searchUsersFuzzyPaged.mockResolvedValue({
      rows: [makeUser({ password: "secret" })],
      total: 21,
    });

    await expect(userService.searchUsersFuzzyForAdmin(query)).resolves.toMatchObject({
      result: [
        {
          id: 1001,
          username: "zhangsan",
          name: "张三",
          orcasId: null,
        },
      ],
      total: 21,
      pageNum: 2,
      pageSize: 10,
      pages: 3,
    });
  });
});

describe("admin userService.getUserDetailByUsernameForAdmin", () => {
  test("rejects missing users", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(userService.getUserDetailByUsernameForAdmin("missing")).rejects.toThrow("用户不存在");

    expect(employmentRepository.getAllEmploymentsByUserIdForAdmin).not.toHaveBeenCalled();
  });

  test("returns all non-deleted employments and summarizes only enabled roles and privileges", async () => {
    const employmentOne = makeEmployment({ id: 4001 });
    const employmentTwo = makeEmployment({
      id: 4002,
      status: EmploymentStatus.Pause,
      position: makePosition({ id: 3002, posCode: "POS002", posName: "经理" }),
    });
    const employmentThree = makeEmployment({
      id: 4003,
      status: EmploymentStatus.Disable,
      endTime: new Date("2026-02-01T00:00:00.000Z"),
      position: makePosition({ id: 3003, posCode: "POS003", posName: "顾问" }),
    });
    const roleDefault = makeRole({ id: 5001, roleCode: "role:default" });
    const roleAdmin = makeRole({ id: 5002, roleCode: "role:admin" });
    const rolePaused = makeRole({ id: 5003, roleCode: "role:paused" });
    const roleEnded = makeRole({ id: 5004, roleCode: "role:ended" });
    const readPrivilege = makePrivilege({ id: 6001, privilegeCode: "priv:read" });
    const writePrivilege = makePrivilege({ id: 6002, privilegeCode: "priv:write" });
    const pausedPrivilege = makePrivilege({ id: 6003, privilegeCode: "priv:paused" });
    const endedPrivilege = makePrivilege({ id: 6004, privilegeCode: "priv:ended" });
    employmentRepository.getAllEmploymentsByUserIdForAdmin.mockResolvedValue([
      employmentOne,
      employmentTwo,
      employmentThree,
    ]);
    roleRepository.getRolesByEmploymentId
      .mockResolvedValueOnce([roleDefault, roleAdmin])
      .mockResolvedValueOnce([rolePaused])
      .mockResolvedValueOnce([roleEnded]);
    privilegeRepository.getPrivilegesByRoleIds
      .mockResolvedValueOnce([readPrivilege, writePrivilege])
      .mockResolvedValueOnce([pausedPrivilege])
      .mockResolvedValueOnce([endedPrivilege]);

    const detail = await userService.getUserDetailByUsernameForAdmin("zhangsan");

    expect(detail).toMatchObject({
      id: 1001,
      username: "zhangsan",
      employments: [
        {
          id: 4001,
          user: { username: "zhangsan", name: "张三" },
          position: { posCode: "POS001", posName: "工程师" },
          organization: {
            assignedOrg: { orgCode: "ORG001" },
            companyNodes: [{ orgCode: "COMP001" }],
          },
          roles: ["role:default", "role:admin"],
          privileges: ["priv:read", "priv:write"],
        },
        {
          id: 4002,
          status: EmploymentStatus.Pause,
          position: { posCode: "POS002", posName: "经理" },
          roles: ["role:paused"],
          privileges: ["priv:paused"],
        },
        {
          id: 4003,
          status: EmploymentStatus.Disable,
          position: { posCode: "POS003", posName: "顾问" },
          roles: ["role:ended"],
          privileges: ["priv:ended"],
        },
      ],
      roles: ["role:default", "role:admin"],
      privileges: ["priv:read", "priv:write"],
    });
    for (const employment of detail.employments) {
      for (const field of [
        "username",
        "name",
        "mobile",
        "wxId",
        "posCode",
        "posName",
        "orgCode",
        "orgName",
        "orgType",
        "compCode",
        "compName",
      ]) {
        expect(employment).not.toHaveProperty(field);
      }
    }

    expect(employmentRepository.getAllEmploymentsByUserIdForAdmin).toHaveBeenCalledWith(1001);
    expect(employmentRepository.getEmploymentsByUserId).not.toHaveBeenCalled();
    expect(roleRepository.getRolesByEmploymentId).toHaveBeenNthCalledWith(1, 4001);
    expect(roleRepository.getRolesByEmploymentId).toHaveBeenNthCalledWith(2, 4002);
    expect(roleRepository.getRolesByEmploymentId).toHaveBeenNthCalledWith(3, 4003);
    expect(privilegeRepository.getPrivilegesByRoleIds).toHaveBeenNthCalledWith(1, [5001, 5002]);
    expect(privilegeRepository.getPrivilegesByRoleIds).toHaveBeenNthCalledWith(2, [5003]);
    expect(privilegeRepository.getPrivilegesByRoleIds).toHaveBeenNthCalledWith(3, [5004]);
  });
});
