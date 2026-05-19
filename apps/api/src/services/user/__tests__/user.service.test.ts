import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PrivilegeDelegationStatus,
  PrivilegeStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const tx = { name: "api-user-service-test-tx" };
const transaction = mock(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));

const config = {
  DEFAULT_USER_PASSWORD: "default-password",
  NODE_ENV: "test",
  PASSWORD_HASH_ROUNDS: 4,
};

const hash = mock(async (password: string, rounds: number) => `hashed:${password}:${rounds}`);
const compare = mock(async () => true);

const userRepository = {
  getUserById: mock(),
  getUserByUsername: mock(),
  searchUsers: mock(),
  setMobile: mock(),
  setPassword: mock(),
  updateEnabledUserStatus: mock(),
};

const employmentRepository = {
  getEmploymentsByUserId: mock(),
};

const roleRepository = {
  getRolesByEmploymentId: mock(),
};

const privilegeRepository = {
  getPrivilegesByRoleIds: mock(),
};

const privilegeDelegationRepository = {
  getDelegationsByUserAndOrganizationScopeAndPrivilege: mock(),
};

const mobileService = {
  checkExistingPhoneNumber: mock(),
  checkValidPhoneNumber: mock(),
  checkVerificationCode: mock(),
};

mock.module("@api/env", () => ({
  default: config,
}));

mock.module("@iam/db", () => ({
  default: {
    transaction,
  },
}));

mock.module("bcrypt-ts", () => ({
  compare,
  hash,
}));

mock.module("@api/services/user/user.repository", () => userRepository);
mock.module("@api/services/employment/employment.repository", () => employmentRepository);
mock.module("@api/services/role/role.repository", () => roleRepository);
mock.module("@api/services/privilege/privilege.repository", () => privilegeRepository);
mock.module("@api/services/privilege/privilegeDelegation.repository", () => privilegeDelegationRepository);
mock.module("@api/services/mobile/mobile.service", () => mobileService);

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

function makeDelegation(overrides: Record<string, unknown> = {}) {
  const delegatorUser = makeUser({ id: 1001, username: "zhangsan", name: "张三" });
  const delegateeUser = makeUser({ id: 1002, username: "lisi", name: "李四" });
  return {
    id: 7001,
    delegatorUserId: delegatorUser.id,
    delegateeUserId: delegateeUser.id,
    organizationScopeId: 2001,
    startTime: fixedDate,
    endTime: new Date("2026-12-31T00:00:00.000Z"),
    status: PrivilegeDelegationStatus.Enable,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    delegatorUser,
    delegateeUser,
    organizationScope: {
      ...makeOrganization(),
      parent: null,
      children: [],
    },
    delegationDetails: [
      {
        delegationId: 7001,
        privilegeId: 6001,
        privilege: makePrivilege(),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  config.NODE_ENV = "test";
  transaction.mockClear();
  hash.mockClear();
  compare.mockClear();
  compare.mockResolvedValue(true);

  userRepository.getUserById.mockReset();
  userRepository.getUserByUsername.mockReset();
  userRepository.searchUsers.mockReset();
  userRepository.setMobile.mockReset();
  userRepository.setPassword.mockReset();
  userRepository.updateEnabledUserStatus.mockReset();
  employmentRepository.getEmploymentsByUserId.mockReset();
  roleRepository.getRolesByEmploymentId.mockReset();
  privilegeRepository.getPrivilegesByRoleIds.mockReset();
  privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege.mockReset();
  mobileService.checkExistingPhoneNumber.mockReset();
  mobileService.checkValidPhoneNumber.mockReset();
  mobileService.checkVerificationCode.mockReset();

  userRepository.getUserByUsername.mockResolvedValue(makeUser());
  userRepository.getUserById.mockResolvedValue(makeUser());
  userRepository.setPassword.mockResolvedValue(makeUser({ password: "new-hash" }));
  userRepository.setMobile.mockResolvedValue(makeUser({ mobile: "17700001111" }));
  userRepository.searchUsers.mockResolvedValue([makeUser()]);
  userRepository.updateEnabledUserStatus.mockResolvedValue(makeUser({ status: UserStatus.Pause }));
  employmentRepository.getEmploymentsByUserId.mockResolvedValue([]);
  roleRepository.getRolesByEmploymentId.mockResolvedValue([]);
  privilegeRepository.getPrivilegesByRoleIds.mockResolvedValue([]);
  privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege.mockResolvedValue([]);
  mobileService.checkValidPhoneNumber.mockReturnValue(true);
  mobileService.checkExistingPhoneNumber.mockResolvedValue(false);
  mobileService.checkVerificationCode.mockResolvedValue(true);
});

describe("userService.setPassword", () => {
  test("rejects when the user does not exist", async () => {
    userRepository.getUserByUsername.mockResolvedValue(null);

    await expect(userService.setPassword("missing", "old-password", "Newpass1")).rejects.toThrow("用户名不存在");

    expect(userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("rejects when old and new passwords are the same", async () => {
    await expect(userService.setPassword("zhangsan", "Samepass1", "Samepass1")).rejects.toThrow(
      "旧密码与新密码相同",
    );

    expect(compare).not.toHaveBeenCalled();
    expect(userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("rejects when the old password does not match", async () => {
    compare.mockResolvedValue(false);

    await expect(userService.setPassword("zhangsan", "wrong-password", "Newpass1")).rejects.toThrow("旧密码错误");

    expect(compare).toHaveBeenCalledWith("wrong-password", "old-hash");
    expect(userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("rejects weak new passwords", async () => {
    await expect(userService.setPassword("zhangsan", "old-password", "Abc1234")).rejects.toThrow(
      "新密码强度过低",
    );
    await expect(userService.setPassword("zhangsan", "old-password", "12345678")).rejects.toThrow(
      "新密码强度过低",
    );
    await expect(userService.setPassword("zhangsan", "old-password", "abcdefgh")).rejects.toThrow(
      "新密码强度过低",
    );

    expect(hash).not.toHaveBeenCalled();
    expect(userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("hashes and saves valid new passwords in the transaction", async () => {
    await expect(userService.setPassword("zhangsan", "old-password", "Newpass1")).resolves.toBe(true);

    expect(hash).toHaveBeenCalledWith("Newpass1", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setPassword).toHaveBeenCalledWith(1001, "hashed:Newpass1:4", tx);
  });
});

describe("userService.resetPassword", () => {
  test("rejects when the user does not exist", async () => {
    userRepository.getUserByUsername.mockResolvedValue(null);

    await expect(userService.resetPassword("missing", "17721462865", "123456", "Newpass1")).rejects.toThrow(
      "用户不存在",
    );

    expect(mobileService.checkVerificationCode).not.toHaveBeenCalled();
  });

  test("rejects when the user's mobile does not match the input mobile", async () => {
    await expect(userService.resetPassword("zhangsan", "17700001111", "123456", "Newpass1")).rejects.toThrow(
      "用户名与手机号不匹配",
    );

    expect(mobileService.checkVerificationCode).not.toHaveBeenCalled();
  });

  test("rejects when the reset password verification code is wrong", async () => {
    mobileService.checkVerificationCode.mockResolvedValue(false);

    await expect(userService.resetPassword("zhangsan", "17721462865", "000000", "Newpass1")).rejects.toThrow(
      "验证码错误",
    );

    expect(userRepository.setPassword).not.toHaveBeenCalled();
  });

  test("hashes and saves the new password when verification succeeds", async () => {
    await expect(userService.resetPassword("zhangsan", "17721462865", "123456", "Newpass1")).resolves.toBe(true);

    expect(mobileService.checkVerificationCode).toHaveBeenCalledWith("resetPassword", "17721462865", "123456");
    expect(hash).toHaveBeenCalledWith("Newpass1", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setPassword).toHaveBeenCalledWith(1001, "hashed:Newpass1:4", tx);
  });

  test("documents current behavior: resetPassword does not enforce setPassword strength rules", async () => {
    await expect(userService.resetPassword("zhangsan", "17721462865", "123456", "weak")).resolves.toBe(true);

    expect(hash).toHaveBeenCalledWith("weak", config.PASSWORD_HASH_ROUNDS);
    expect(userRepository.setPassword).toHaveBeenCalledWith(1001, "hashed:weak:4", tx);
  });
});

describe("userService.checkPassword", () => {
  test("rejects when the user does not exist", async () => {
    userRepository.getUserByUsername.mockResolvedValue(null);

    await expect(userService.checkPassword("missing", "password")).rejects.toThrow("用户不存在");
  });

  test("returns false for passwordless users in production", async () => {
    config.NODE_ENV = "production";
    userRepository.getUserByUsername.mockResolvedValue(makeUser({ password: null }));

    await expect(userService.checkPassword("zhangsan", config.DEFAULT_USER_PASSWORD)).resolves.toBe(false);

    expect(compare).not.toHaveBeenCalled();
  });

  test("accepts the default password for passwordless users outside production", async () => {
    userRepository.getUserByUsername.mockResolvedValue(makeUser({ password: null }));

    await expect(userService.checkPassword("zhangsan", config.DEFAULT_USER_PASSWORD)).resolves.toBe(true);
    await expect(userService.checkPassword("zhangsan", "other-password")).resolves.toBe(false);

    expect(compare).not.toHaveBeenCalled();
  });

  test("uses bcrypt compare and returns its result for users with a password", async () => {
    compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(userService.checkPassword("zhangsan", "first-password")).resolves.toBe(true);
    await expect(userService.checkPassword("zhangsan", "second-password")).resolves.toBe(false);

    expect(compare).toHaveBeenNthCalledWith(1, "first-password", "old-hash");
    expect(compare).toHaveBeenNthCalledWith(2, "second-password", "old-hash");
  });
});

describe("userService.setMobile", () => {
  test("rejects invalid phone numbers before checking duplicates or verification codes", async () => {
    const calls: string[] = [];
    mobileService.checkValidPhoneNumber.mockImplementation(() => {
      calls.push("valid");
      return false;
    });
    mobileService.checkExistingPhoneNumber.mockImplementation(async () => {
      calls.push("existing");
      return false;
    });
    mobileService.checkVerificationCode.mockImplementation(async () => {
      calls.push("code");
      return true;
    });

    await expect(userService.setMobile(1001, "bad-phone", "123456")).rejects.toThrow("无效手机号");

    expect(calls).toEqual(["valid"]);
    expect(userRepository.setMobile).not.toHaveBeenCalled();
  });

  test("rejects existing phone numbers before checking verification codes", async () => {
    const calls: string[] = [];
    mobileService.checkValidPhoneNumber.mockImplementation(() => {
      calls.push("valid");
      return true;
    });
    mobileService.checkExistingPhoneNumber.mockImplementation(async () => {
      calls.push("existing");
      return true;
    });
    mobileService.checkVerificationCode.mockImplementation(async () => {
      calls.push("code");
      return true;
    });

    await expect(userService.setMobile(1001, "17700001111", "123456")).rejects.toThrow("手机号已存在");

    expect(calls).toEqual(["valid", "existing"]);
    expect(userRepository.setMobile).not.toHaveBeenCalled();
  });

  test("rejects wrong verification codes before writing the phone number", async () => {
    const calls: string[] = [];
    mobileService.checkValidPhoneNumber.mockImplementation(() => {
      calls.push("valid");
      return true;
    });
    mobileService.checkExistingPhoneNumber.mockImplementation(async () => {
      calls.push("existing");
      return false;
    });
    mobileService.checkVerificationCode.mockImplementation(async () => {
      calls.push("code");
      return false;
    });

    await expect(userService.setMobile(1001, "17700001111", "000000")).rejects.toThrow("验证码错误");

    expect(calls).toEqual(["valid", "existing", "code"]);
    expect(userRepository.setMobile).not.toHaveBeenCalled();
  });

  test("writes the phone number and returns refreshed user detail when verification succeeds", async () => {
    const calls: string[] = [];
    const refreshedUser = makeUser({ mobile: "17700001111" });
    userRepository.getUserById.mockResolvedValue(refreshedUser);
    employmentRepository.getEmploymentsByUserId.mockResolvedValue([]);
    mobileService.checkValidPhoneNumber.mockImplementation(() => {
      calls.push("valid");
      return true;
    });
    mobileService.checkExistingPhoneNumber.mockImplementation(async () => {
      calls.push("existing");
      return false;
    });
    mobileService.checkVerificationCode.mockImplementation(async () => {
      calls.push("code");
      return true;
    });
    userRepository.setMobile.mockImplementation(async () => {
      calls.push("write");
      return refreshedUser;
    });

    await expect(userService.setMobile(1001, "17700001111", "123456")).resolves.toMatchObject({
      id: 1001,
      mobile: "17700001111",
      employments: [],
      roles: [],
      privileges: [],
    });

    expect(calls).toEqual(["valid", "existing", "code", "write"]);
    expect(mobileService.checkVerificationCode).toHaveBeenCalledWith("bindPhone", "17700001111", "123456");
    expect(userRepository.setMobile).toHaveBeenCalledWith(1001, "17700001111", tx);
    expect(userRepository.getUserById).toHaveBeenCalledWith(1001);
  });
});

describe("userService.pauseEnabledUser", () => {
  test("updates enabled users to paused and returns the repository result", async () => {
    const pausedUser = makeUser({ status: UserStatus.Pause });
    userRepository.updateEnabledUserStatus.mockResolvedValue(pausedUser);

    await expect(userService.pauseEnabledUser(1001)).resolves.toBe(pausedUser);

    expect(userRepository.updateEnabledUserStatus).toHaveBeenCalledWith(1001, UserStatus.Pause);
  });

  test("returns null when the repository does not update a user", async () => {
    userRepository.updateEnabledUserStatus.mockResolvedValue(null);

    await expect(userService.pauseEnabledUser(1001)).resolves.toBeNull();
  });
});

describe("userService.searchUsersWithPrivilegeDelegation", () => {
  test("rejects empty or multi-valued ancestorOrgCodes", async () => {
    await expect(
      userService.searchUsersWithPrivilegeDelegation({ ancestorOrgCodes: [], privilegeCode: "priv:read" }),
    ).rejects.toThrow("该接口ancestorOrgCodes元素数量只支持为1");
    await expect(
      userService.searchUsersWithPrivilegeDelegation({
        ancestorOrgCodes: ["ORG001", "ORG002"],
        privilegeCode: "priv:read",
      }),
    ).rejects.toThrow("该接口ancestorOrgCodes元素数量只支持为1");

    expect(userRepository.searchUsers).not.toHaveBeenCalled();
  });

  test("returns mapped users and delegations for supported queries", async () => {
    const user = makeUser({ password: "secret" });
    const delegation = makeDelegation();
    const query = {
      ancestorOrgCodes: ["ORG001"],
      privilegeCode: "priv:read",
      usernames: ["zhangsan"],
    };
    userRepository.searchUsers.mockResolvedValue([user]);
    privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege.mockResolvedValue([delegation]);

    await expect(userService.searchUsersWithPrivilegeDelegation(query)).resolves.toMatchObject({
      users: [
        {
          id: 1001,
          username: "zhangsan",
          name: "张三",
          orcasId: null,
        },
      ],
      delegations: [
        {
          id: 7001,
          delegatorUsername: "zhangsan",
          delegatorName: "张三",
          delegateeUsername: "lisi",
          delegateeName: "李四",
        },
      ],
    });

    expect(userRepository.searchUsers).toHaveBeenCalledWith(query);
    expect(privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege).toHaveBeenCalledWith(
      ["zhangsan"],
      "ORG001",
      "priv:read",
    );
  });
});
