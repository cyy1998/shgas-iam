import { createV3UserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search-v3.adapter";
import { createUserDelegationQuery } from "@api/services/user/user-delegation-query.helper";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createFakePasswordHasher } from "@api/testing/fakes";
import { BadRequestError } from "@iam/api-core/errors";
import { UserStatus, UserType } from "@iam/contracts";
import { createV3UserProfileQueryService } from "@iam/user-profile-read-model/v3";
import { describe, expect, mock, test } from "bun:test";

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
      userProfileSearch: { searchLegacyUsers: mock(async () => []) },
      privilegeDelegationRepository: {
        getDelegationsByUserAndOrganizationScopeAndPrivilege: mock(async () => []),
      },
    });

    await expect(delegationQuery.searchUsersWithDelegations({
      ancestorOrgCodes: [],
      privilegeCode: "p",
    } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("delegation query combines profile users with live delegations", async () => {
    const events: string[] = [];
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
    };
    const searchLegacyUsers = mock(async () => {
      events.push("search");
      return [profileUser];
    });
    const getDelegationsByUserAndOrganizationScopeAndPrivilege = mock(async () => {
      events.push("delegation");
      return [];
    });
    const delegationQuery = createUserDelegationQuery({
      userProfileSearch: { searchLegacyUsers },
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
    expect(events).toEqual(["search", "delegation"]);
  });

  test("lets the canonical search boundary reject an empty delegation organization filter", async () => {
    const searchCurrentProfiles = mock(async () => []);
    const profileSearch = createV3UserProfileSearchAdapter(
      createV3UserProfileQueryService({
        profileRepository: {
          searchCurrentProfileBases: mock(async () => []),
          searchCurrentProfiles,
        },
      }),
    );
    const getDelegationsByUserAndOrganizationScopeAndPrivilege = mock(async () => []);
    const delegationQuery = createUserDelegationQuery({
      userProfileSearch: profileSearch,
      privilegeDelegationRepository: {
        getDelegationsByUserAndOrganizationScopeAndPrivilege,
      },
    });

    const error = await delegationQuery.searchUsersWithDelegations({
      ancestorOrgCodes: [],
      privilegeCode: "privilege:a",
    }).catch((error: unknown) => error);

    expect(error).toMatchObject({
      code: "COMMON.VALIDATION_FAILED",
      httpStatus: 422,
    });
    expect(searchCurrentProfiles).not.toHaveBeenCalled();
    expect(getDelegationsByUserAndOrganizationScopeAndPrivilege).not.toHaveBeenCalled();
  });
});
