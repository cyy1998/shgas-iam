import type { AuditLogInput } from "@api/services/audit/audit.service";
import { expect, test } from "bun:test";
import { createRequestPasswordResetCodeUseCase } from "../request-password-reset-code.use-case";

test("requests a password-reset code for the bound mobile before auditing", async () => {
  const events: string[] = [];
  const useCase = createRequestPasswordResetCodeUseCase({
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
    mobileCodeSender: {
      sendCode: async () => {
        events.push("send");
        return true;
      },
    },
  });

  await useCase.execute({ username: "zhangsan", phoneNumber: "177****2865" });

  expect(events).toEqual(["resolve", "send", "audit"]);
});

test("records the existing masked password-reset code audit", async () => {
  let audit: AuditLogInput | undefined;
  const useCase = createRequestPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async (input) => {
        audit = input;
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => "17721462865",
    },
    mobileCodeSender: {
      sendCode: async () => true,
    },
  });

  await useCase.execute({ username: "zhangsan", phoneNumber: "177****2865" }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-1",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  });

  expect(audit).toMatchObject({
    action: "auth.sms_code.send",
    outcome: "success",
    requestId: "req-1",
    details: {
      phoneNumber: "177****2865",
      usage: "resetPassword",
      username: "zhangsan",
    },
  });
});

test("does not audit when password-reset SMS send fails", async () => {
  let audited = false;
  const useCase = createRequestPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async () => {
        audited = true;
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => "17721462865",
    },
    mobileCodeSender: {
      sendCode: async () => {
        throw new Error("sms failed");
      },
    },
  });

  await expect(useCase.execute({ username: "zhangsan" })).rejects.toThrow("sms failed");

  expect(audited).toBeFalse();
});

test("propagates password-reset code audit failures", async () => {
  const useCase = createRequestPasswordResetCodeUseCase({
    auditLogWriter: {
      recordAuditLog: async () => {
        throw new Error("audit failed");
      },
    },
    boundMobileResolver: {
      resolveBoundMobile: async () => "17721462865",
    },
    mobileCodeSender: {
      sendCode: async () => true,
    },
  });

  await expect(useCase.execute({ username: "zhangsan" })).rejects.toThrow("audit failed");
});
