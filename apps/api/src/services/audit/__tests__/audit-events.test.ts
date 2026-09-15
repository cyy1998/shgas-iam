import * as customSsoAuditEvents from "@iam/custom-sso/testing";
import { describe, expect, test } from "bun:test";
import * as authAudit from "../events/auth.audit";
import * as internalAudit from "../events/internal.audit";
import * as selfUserAudit from "../events/self-user.audit";

describe("api audit event builders", () => {
  test("builds password login success and failure payloads with canonical action", () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    expect(authAudit.buildPasswordLoginFailureAudit("zhangsan", "invalid_password", user)).toMatchObject({
      action: "auth.login.password",
      outcome: "failure",
      actorType: "anonymous",
      details: {
        reason: "invalid_password",
        username: "zhangsan",
      },
    });
    expect(authAudit.buildPasswordLoginSuccessAudit(user)).toMatchObject({
      action: "auth.login.password",
      outcome: "success",
      actorType: "user",
      details: {
        clientCode: "global",
        loginType: "password",
      },
    });
  });

  test("builds mobile login success and failure payloads with masked phone", () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    expect(authAudit.buildMobileLoginFailureAudit("17721462865", "invalid_verification_code", user)).toMatchObject({
      action: "auth.login.mobile",
      outcome: "failure",
      actorType: "anonymous",
      targetCode: "177****2865",
      details: {
        phoneNumber: "177****2865",
        reason: "invalid_verification_code",
      },
    });
    expect(authAudit.buildMobileLoginSuccessAudit(user)).toMatchObject({
      action: "auth.login.mobile",
      outcome: "success",
      actorType: "user",
      details: {
        clientCode: "global",
        loginType: "mobile",
      },
    });
  });

  test("builds sso and third-party login success payloads", () => {
    const user = { id: 1001, username: "zhangsan", name: "张三" } as never;

    const gatewayAudit = customSsoAuditEvents.buildGatewayLoginSuccessAudit(
      "00000000-0000-4000-8000-000000001001",
      "portal",
    );
    expect(gatewayAudit).toEqual({
      action: "auth.login.local",
      actorType: "user",
      actorUserId: null,
      outcome: "success",
      targetCode: "00000000-0000-4000-8000-000000001001",
      targetId: null,
      targetType: "subject",
      details: {
        clientCode: "portal",
        loginType: "local",
        mode: "gateway",
      },
    });
    const independentAudit = customSsoAuditEvents.buildIndependentLoginSuccessAudit(
      "00000000-0000-4000-8000-000000001001",
      "portal",
    );
    expect(independentAudit).toEqual({
      action: "auth.login.local",
      actorType: "user",
      actorUserId: null,
      outcome: "success",
      targetCode: "00000000-0000-4000-8000-000000001001",
      targetId: null,
      targetType: "subject",
      details: {
        clientCode: "portal",
        loginType: "local",
        mode: "independent",
      },
    });
    expect(authAudit.buildOaLoginSuccessAudit(user, "oa")).toMatchObject({
      action: "auth.login.oa",
      outcome: "success",
      details: {
        clientCode: "oa",
        loginType: "oa",
      },
    });
    expect(authAudit.buildWechatLoginSuccessAudit(user)).toMatchObject({
      action: "auth.login.wechat",
      outcome: "success",
      details: {
        loginType: "wechat",
      },
    });
  });

  test("builds self user mobile bind failure payload with masked phone", () => {
    expect(selfUserAudit.buildMobileBindInvalidCodeAudit(1001, "17721462865")).toMatchObject({
      action: "self.mobile.bind",
      outcome: "failure",
      targetCode: "177****2865",
      details: {
        phoneNumber: "177****2865",
        reason: "invalid_verification_code",
      },
    });
  });

  test("builds auth SMS verification payload", () => {
    expect(authAudit.buildSmsCodeVerifyAudit({
      phoneNumber: "17721462865",
      usage: "login",
      username: "zhangsan",
      verified: false,
    })).toMatchObject({
      action: "auth.sms_code.verify",
      outcome: "failure",
      targetCode: "177****2865",
    });
  });

  test("builds internal supplier contact registration payload with injected client actor", () => {
    expect(internalAudit.buildInternalPurveyorContactRegisterAudit(
      { actorType: "client", actorClientCode: "portal" },
      {
        targetUserId: 1001,
        username: "zhangsan",
        name: "张三",
        mobile: "17721462865",
        orgCode: "ORG001",
        existingContact: false,
      },
    )).toMatchObject({
      action: "internal.purveyor_contact.register",
      actorType: "client",
      actorClientCode: "portal",
      details: expect.objectContaining({
        mobile: "177****2865",
      }),
    });
  });
});
