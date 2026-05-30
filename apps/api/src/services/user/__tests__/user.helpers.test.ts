import { UserStatus, UserType } from "@iam/contracts";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const config = {
  DEFAULT_USER_PASSWORD: "default-password",
  NODE_ENV: "test",
  PASSWORD_HASH_ROUNDS: 4,
};

const compare = mock(async () => true);
const hash = mock(async (password: string, rounds: number) => `hashed:${password}:${rounds}`);

const employmentRepository = {
  getEmploymentsByUserId: mock(),
};

const mobileService = {
  checkExistingPhoneNumber: mock(),
  checkValidPhoneNumber: mock(),
  checkVerificationCode: mock(),
};

const privilegeDelegationRepository = {
  getDelegationsByUserAndOrganizationScopeAndPrivilege: mock(),
};

const privilegeDelegationSchema = {
  toPrivilegeDelegationDto: mock((delegation: { id: number }) => ({ id: delegation.id })),
};

const roleRepository = {
  getRolesByEmploymentId: mock(),
};

const privilegeRepository = {
  getPrivilegesByRoleIds: mock(),
};

const selfUserAudit = {
  recordMobileBindInvalidCode: mock(),
};

const userRepository = {
  searchUsers: mock(),
};

mock.module("@api/env", () => ({
  default: config,
}));

mock.module("bcrypt-ts", () => ({
  compare,
  hash,
}));

mock.module("@api/services/employment/employment.repository", () => employmentRepository);
mock.module("@api/services/mobile/mobile.service", () => mobileService);
mock.module("@api/services/privilege/privilege.repository", () => privilegeRepository);
mock.module("@api/services/privilege/privilegeDelegation.repository", () => privilegeDelegationRepository);
mock.module("@api/services/privilege/privilegeDelegation.schema", () => privilegeDelegationSchema);
mock.module("@api/services/role/role.repository", () => roleRepository);
mock.module("@api/services/audit/events/self-user.audit", () => selfUserAudit);
mock.module("@api/services/user/user.repository", () => userRepository);

const passwordHelper = await import("../user-password.helper");
const detailHelper = await import("../user-detail.helper");
const mobileBindingHelper = await import("../user-mobile-binding.helper");
const delegationQueryHelper = await import("../user-delegation-query.helper");

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

beforeEach(() => {
  config.NODE_ENV = "test";
  compare.mockClear();
  hash.mockClear();
  compare.mockResolvedValue(true);
  employmentRepository.getEmploymentsByUserId.mockReset();
  mobileService.checkExistingPhoneNumber.mockReset();
  mobileService.checkValidPhoneNumber.mockReset();
  mobileService.checkVerificationCode.mockReset();
  privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege.mockReset();
  privilegeDelegationSchema.toPrivilegeDelegationDto.mockClear();
  roleRepository.getRolesByEmploymentId.mockReset();
  privilegeRepository.getPrivilegesByRoleIds.mockReset();
  selfUserAudit.recordMobileBindInvalidCode.mockReset();
  userRepository.searchUsers.mockReset();

  employmentRepository.getEmploymentsByUserId.mockResolvedValue([]);
  mobileService.checkValidPhoneNumber.mockReturnValue(true);
  mobileService.checkExistingPhoneNumber.mockResolvedValue(false);
  mobileService.checkVerificationCode.mockResolvedValue(true);
  privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege.mockResolvedValue([]);
  userRepository.searchUsers.mockResolvedValue([makeUser()]);
});

describe("user password helper", () => {
  test("validates strength and hashes with configured rounds", async () => {
    expect(passwordHelper.isStrongPassword("Newpass1")).toBe(true);
    expect(passwordHelper.isStrongPassword("weak")).toBe(false);

    await expect(passwordHelper.hashUserPassword("Newpass1")).resolves.toBe("hashed:Newpass1:4");

    expect(hash).toHaveBeenCalledWith("Newpass1", 4);
  });

  test("verifies bcrypt and default passwords without querying users", async () => {
    await expect(passwordHelper.verifyUserPassword(makeUser(), "old-password")).resolves.toBe(true);
    await expect(passwordHelper.verifyUserPassword(makeUser({ password: null }), "default-password")).resolves.toBe(
      true,
    );
    config.NODE_ENV = "production";
    await expect(passwordHelper.verifyUserPassword(makeUser({ password: null }), "default-password")).resolves.toBe(
      false,
    );
  });
});

describe("user detail helper", () => {
  test("returns user detail with empty employment role and privilege aggregates", async () => {
    await expect(detailHelper.buildUserDetail(makeUser())).resolves.toMatchObject({
      id: 1001,
      username: "zhangsan",
      employments: [],
      roles: [],
      privileges: [],
    });

    expect(employmentRepository.getEmploymentsByUserId).toHaveBeenCalledWith(1001);
  });
});

describe("user mobile binding helper", () => {
  test("validates in order and records audit when verification code is invalid", async () => {
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

    await expect(
      mobileBindingHelper.assertCanBindMobile(1001, "17700001111", "000000", { name: "tx" } as never),
    ).rejects.toThrow("验证码错误");

    expect(calls).toEqual(["valid", "existing", "code"]);
    expect(selfUserAudit.recordMobileBindInvalidCode).toHaveBeenCalledWith(
      1001,
      "17700001111",
      { name: "tx" },
    );
  });
});

describe("user delegation query helper", () => {
  test("requires one ancestor org code and returns mapped users and delegations", async () => {
    await expect(
      delegationQueryHelper.searchUsersWithDelegations({ ancestorOrgCodes: [], privilegeCode: "priv:read" }),
    ).rejects.toThrow("该接口ancestorOrgCodes元素数量只支持为1");

    privilegeDelegationRepository
      .getDelegationsByUserAndOrganizationScopeAndPrivilege
      .mockResolvedValue([{ id: 7001 }]);

    await expect(delegationQueryHelper.searchUsersWithDelegations({
      ancestorOrgCodes: ["ORG001"],
      privilegeCode: "priv:read",
    })).resolves.toMatchObject({
      users: [{ username: "zhangsan" }],
      delegations: [{ id: 7001 }],
    });

    expect(privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege).toHaveBeenCalledWith(
      ["zhangsan"],
      "ORG001",
      "priv:read",
    );
  });
});
