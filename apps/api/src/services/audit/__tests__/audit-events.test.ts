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
  test("records password login success and failure with canonical action", async () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    await authAudit.recordPasswordLoginFailure("zhangsan", "invalid_password", user);
    await authAudit.recordPasswordLoginSuccess(user);

    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "auth.login.password",
      outcome: "failure",
      actorType: "anonymous",
      details: {
        reason: "invalid_password",
        username: "zhangsan",
      },
    }));
    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "auth.login.password",
      outcome: "success",
      actorType: "user",
      details: {
        clientCode: "global",
        loginType: "password",
      },
    }));
  });

  test("records mobile login success and failure with canonical action", async () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    await authAudit.recordMobileLoginFailure("17721462865", "invalid_verification_code", user);
    await authAudit.recordMobileLoginSuccess(user);

    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "auth.login.mobile",
      outcome: "failure",
      actorType: "anonymous",
      targetCode: "177****2865",
      details: {
        phoneNumber: "177****2865",
        reason: "invalid_verification_code",
      },
    }));
    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "auth.login.mobile",
      outcome: "success",
      actorType: "user",
      details: {
        clientCode: "global",
        loginType: "mobile",
      },
    }));
  });

  test("records sso and third-party login successes with canonical actions", async () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    await authAudit.recordLocalLoginSuccess(user, "portal", "admin" as never);
    await authAudit.recordOaLoginSuccess(user, "oa");
    await authAudit.recordWechatLoginSuccess(user);

    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "auth.login.local",
      outcome: "success",
      details: {
        clientCode: "portal",
        loginType: "local",
        managementLevel: "admin",
      },
    }));
    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "auth.login.oa",
      outcome: "success",
      details: {
        clientCode: "oa",
        loginType: "oa",
      },
    }));
    expect(auditService.recordAuditLog).toHaveBeenNthCalledWith(3, expect.objectContaining({
      action: "auth.login.wechat",
      outcome: "success",
      details: {
        loginType: "wechat",
      },
    }));
  });

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
