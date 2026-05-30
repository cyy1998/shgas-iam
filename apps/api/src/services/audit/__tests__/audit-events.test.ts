import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const auditService = {
  getInternalAuditActor: mock(() => ({ actorType: "client", actorClientCode: "portal" })),
  recordAuditLog: mock(),
  recordAuditLogFromContext: mock(),
};

mock.module("@api/services/audit/audit.service", () => auditService);

const authAudit = await import("../events/auth.audit");
const internalAudit = await import("../events/internal.audit");
const selfUserAudit = await import("../events/self-user.audit");

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  auditService.getInternalAuditActor.mockClear();
  auditService.recordAuditLog.mockReset();
  auditService.recordAuditLogFromContext.mockReset();
});

describe("api audit event helpers", () => {
  test("records self user mobile bind failure with masked phone", async () => {
    await selfUserAudit.recordMobileBindInvalidCode(1001, "17721462865", { name: "tx" } as never);

    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "self.mobile.bind",
      outcome: "failure",
      targetCode: "177****2865",
      details: {
        phoneNumber: "177****2865",
        reason: "invalid_verification_code",
      },
    }), { name: "tx" });
  });

  test("records auth SMS verification through request context", async () => {
    const context = { req: { path: "/open", method: "POST" } };

    await authAudit.recordSmsCodeVerify(context as never, {
      phoneNumber: "17721462865",
      usage: "login",
      username: "zhangsan",
      verified: false,
    });

    expect(auditService.recordAuditLogFromContext).toHaveBeenCalledWith(context, expect.objectContaining({
      action: "auth.sms_code.verify",
      outcome: "failure",
      targetCode: "177****2865",
    }));
  });

  test("records internal supplier contact registration with client actor", async () => {
    const context = { req: { header: () => "portal" } };

    await internalAudit.recordInternalPurveyorContactRegister(context as never, {
      targetUserId: 1001,
      username: "zhangsan",
      name: "张三",
      mobile: "17721462865",
      orgCode: "ORG001",
      existingContact: false,
    });

    expect(auditService.recordAuditLogFromContext).toHaveBeenCalledWith(context, expect.objectContaining({
      action: "internal.purveyor_contact.register",
      actorType: "client",
      actorClientCode: "portal",
      details: expect.objectContaining({
        mobile: "177****2865",
      }),
    }));
  });
});
