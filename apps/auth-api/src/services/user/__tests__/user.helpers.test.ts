import { describe, expect, mock, test } from "bun:test";
import { createUserMobileBinding } from "@auth-api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@auth-api/services/user/user-password.helper";
import { createFakePasswordHasher } from "@auth-api/testing/fakes";

describe("user helper factories", () => {
  test("hashes and verifies passwords through injected hasher", async () => {
    const passwordHelper = createUserPasswordHelper({
      passwordHasher: createFakePasswordHasher(),
    });

    await expect(passwordHelper.hashUserPassword("Abcd1234")).resolves.toBe("hashed:Abcd1234");
    await expect(passwordHelper.verifyUserPassword({ password: "hashed:Abcd1234" } as any, "Abcd1234")).resolves.toBe(
      true,
    );
    expect(() => passwordHelper.assertStrongPassword("short")).toThrow("新密码强度过低");
  });

  test("validates mobile binding before allowing mutation", async () => {
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
    };
    const consumeVerificationCode = mock(async () => true);
    const mobileBinding = createUserMobileBinding({
      userRepository: { isMobileRegistered: async () => false },
      auditLogWriter,
      mobileService: {
        checkValidPhoneNumber: mock(() => true),
        consumeVerificationCode,
      },
    });

    await mobileBinding.consumeBindingCode(1, "13800000000", "1234");
    expect(consumeVerificationCode).toHaveBeenCalledWith("bindPhone", "13800000000", "1234");
  });

  test("records mobile binding failures with request context", async () => {
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
    };
    const mobileBinding = createUserMobileBinding({
      userRepository: { isMobileRegistered: async () => false },
      auditLogWriter,
      mobileService: {
        checkValidPhoneNumber: mock(() => true),
        consumeVerificationCode: mock(async () => false),
      },
    });

    await expect(
      mobileBinding.consumeBindingCode(1, "13800000000", "bad-code", {
        requestContext: {
          sourceApp: "iam",
          requestId: "req-mobile-bind",
          traceId: "11111111111111111111111111111111",
          ip: "203.0.113.10",
          userAgent: "user-helper-test",
          route: "/public/mobile",
          method: "POST",
        },
      }),
    ).rejects.toThrow("验证码错误");

    expect(auditLogWriter.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "self.mobile.bind",
        outcome: "failure",
        requestId: "req-mobile-bind",
        traceId: "11111111111111111111111111111111",
      }),
    );
  });
});
