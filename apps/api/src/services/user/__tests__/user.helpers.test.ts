import { createFakePasswordHasher } from "@api/testing/fakes";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserDelegationQuery } from "../user-delegation-query.helper";
import { createUserMobileBinding } from "../user-mobile-binding.helper";
import { createUserPasswordHelper } from "../user-password.helper";

describe("user helper factories", () => {
  test("hashes and verifies passwords through injected hasher", async () => {
    const passwordHelper = createUserPasswordHelper({
      passwordHasher: createFakePasswordHasher(),
    });

    await expect(passwordHelper.hashUserPassword("Abcd1234")).resolves.toBe("hashed:Abcd1234");
    await expect(passwordHelper.verifyUserPassword({ password: "hashed:Abcd1234" } as any, "Abcd1234")).resolves.toBe(true);
    expect(() => passwordHelper.assertStrongPassword("short")).toThrow("新密码强度过低");
  });

  test("validates mobile binding before allowing mutation", async () => {
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
      recordAuditLogFromContext: mock(async () => undefined),
    };
    const reservation = { usage: "bindPhone", phone: "13800000000", token: "reservation-1" };
    const mobileBinding = createUserMobileBinding({
      auditLogWriter,
      mobileService: {
        checkExistingPhoneNumber: mock(async () => false),
        checkValidPhoneNumber: mock(() => true),
        reserveVerificationCode: mock(async () => reservation),
      },
    });

    await expect(mobileBinding.assertCanBindMobile(1, "13800000000", "1234")).resolves.toEqual(reservation);
  });

  test("records mobile binding failures with request context", async () => {
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
      recordAuditLogFromContext: mock(async () => undefined),
    };
    const mobileBinding = createUserMobileBinding({
      auditLogWriter,
      mobileService: {
        checkExistingPhoneNumber: mock(async () => false),
        checkValidPhoneNumber: mock(() => true),
        reserveVerificationCode: mock(async () => null),
      },
    });

    await expect(mobileBinding.assertCanBindMobile(1, "13800000000", "bad-code", {
      requestContext: {
        sourceApp: "iam",
        requestId: "req-mobile-bind",
        traceId: "11111111111111111111111111111111",
        ip: "203.0.113.10",
        userAgent: "user-helper-test",
        route: "/public/mobile",
        method: "POST",
      },
    })).rejects.toThrow("验证码错误");

    expect(auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "self.mobile.bind",
      outcome: "failure",
      requestId: "req-mobile-bind",
      traceId: "11111111111111111111111111111111",
    }));
  });

  test("delegation query enforces a single ancestor organization", async () => {
    const delegationQuery = createUserDelegationQuery({
      profileQuery: { searchLegacyUsers: mock(async () => []) },
      privilegeDelegationRepository: {
        getDelegationsByUserAndOrganizationScopeAndPrivilege: mock(async () => []),
      },
    });

    await expect(delegationQuery.searchUsersWithDelegations({
      ancestorOrgCodes: [],
      privilegeCode: "p",
    } as any)).rejects.toThrow("ancestorOrgCodes元素数量只支持为1");
  });

  test("delegation query combines profile users with live delegations", async () => {
    const profileUser = {
      id: 1,
      username: "zhangsan",
      wxId: null,
      name: "张三",
      mobile: "13800000000",
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: new Date("2026-01-01T00:00:00.000Z"),
      updateTime: new Date("2026-01-01T00:00:00.000Z"),
      orcasId: null,
    };
    const searchLegacyUsers = mock(async () => [profileUser]);
    const getDelegationsByUserAndOrganizationScopeAndPrivilege = mock(async () => []);
    const delegationQuery = createUserDelegationQuery({
      profileQuery: { searchLegacyUsers },
      privilegeDelegationRepository: {
        getDelegationsByUserAndOrganizationScopeAndPrivilege,
      },
    } as any);

    await expect(delegationQuery.searchUsersWithDelegations({
      ancestorOrgCodes: ["ORG"],
      names: ["张三"],
      privilegeCode: "privilege:a",
    } as any)).resolves.toEqual({
      users: [profileUser],
      delegations: [],
    });

    expect(searchLegacyUsers).toHaveBeenCalledWith({
      ancestorOrgCodes: ["ORG"],
      names: ["张三"],
      privilegeCode: "privilege:a",
    });
    expect(getDelegationsByUserAndOrganizationScopeAndPrivilege).toHaveBeenCalledWith(
      ["zhangsan"],
      "ORG",
      "privilege:a",
    );
  });
});
