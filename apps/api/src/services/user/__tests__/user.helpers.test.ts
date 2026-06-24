import { createFakePasswordHasher } from "@api/testing/fakes";
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
    const mobileBinding = createUserMobileBinding({
      auditLogWriter,
      mobileService: {
        checkExistingPhoneNumber: mock(async () => false),
        checkValidPhoneNumber: mock(() => true),
        consumeVerificationCode: mock(async () => true),
      },
    });

    await expect(mobileBinding.assertCanBindMobile(1, "13800000000", "1234")).resolves.toBeUndefined();
  });

  test("delegation query enforces a single ancestor organization", async () => {
    const delegationQuery = createUserDelegationQuery({
      userRepository: { searchUsers: mock(async () => []) },
      privilegeDelegationRepository: {
        getDelegationsByUserAndOrganizationScopeAndPrivilege: mock(async () => []),
      },
    });

    await expect(delegationQuery.searchUsersWithDelegations({
      ancestorOrgCodes: [],
      privilegeCode: "p",
    } as any)).rejects.toThrow("ancestorOrgCodes元素数量只支持为1");
  });
});
