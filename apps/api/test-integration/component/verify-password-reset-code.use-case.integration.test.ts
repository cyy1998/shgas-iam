import type { AuditLogInput } from "@api/services/audit/audit.context";
import { createVerifyPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import { expect, test } from "bun:test";

test("checks a password-reset code without consuming it before auditing", async () => {
  const events: string[] = [];
  const useCase = createVerifyPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async () => {
        events.push("audit");
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => {
        events.push("resolve");
        return "17721462865";
      },
    },
    mobileCodeVerifier: {
      checkVerificationCode: async () => {
        events.push("check");
        return true;
      },
    },
  });

  const result = await useCase.execute({
    code: "123456",
    phoneNumber: "177****2865",
    username: "zhangsan",
  });

  expect({ events, result }).toEqual({ events: ["resolve", "check", "audit"], result: true });
});

test("returns false and records the existing failed verification audit", async () => {
  let audit: AuditLogInput | undefined;
  const useCase = createVerifyPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async (input) => {
        audit = input;
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => "17721462865",
    },
    mobileCodeVerifier: {
      checkVerificationCode: async () => false,
    },
  });

  const result = await useCase.execute({
    code: "000000",
    username: "zhangsan",
  });

  expect({ audit, result }).toMatchObject({
    audit: {
      action: "auth.sms_code.verify",
      outcome: "failure",
      details: {
        phoneNumber: "177****2865",
        usage: "resetPassword",
        username: "zhangsan",
      },
    },
    result: false,
  });
});

test("records the existing successful verification audit", async () => {
  let audit: AuditLogInput | undefined;
  const useCase = createVerifyPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async (input) => {
        audit = input;
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => "17721462865",
    },
    mobileCodeVerifier: {
      checkVerificationCode: async () => true,
    },
  });

  await useCase.execute({ code: "123456", username: "zhangsan" });

  expect(audit).toMatchObject({
    action: "auth.sms_code.verify",
    outcome: "success",
  });
});
