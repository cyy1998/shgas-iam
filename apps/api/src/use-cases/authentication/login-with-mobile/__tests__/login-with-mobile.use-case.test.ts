import type { LoginWithMobileDeps } from "../login-with-mobile.port";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { LoginRestrictionUnavailableError } from "@iam/api-core/login-restriction";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createLoginWithMobileUseCase } from "../login-with-mobile.use-case";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";

const userDetail = {
  id: 1001,
  username: "138550",
  wxId: null,
  name: "测试用户",
  mobile: "17721462865",
  userType: UserType.Formal,
  orderNum: 1,
  status: UserStatus.Enable,
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
  employments: [],
  roles: [],
  privileges: [],
};

function loginRestrictionUnavailable() {
  return new LoginRestrictionUnavailableError({
    cause: new Error("Redis unavailable"),
  });
}

function temporaryRestriction(
  triggerMethod: "mobile" | "password" | "unknown" = "mobile",
) {
  return {
    remainingSeconds: 30 * 60,
    triggerMethod,
  };
}

function createFixture(overrides: {
  codeValid?: boolean;
  restriction?: ReturnType<typeof temporaryRestriction> | null;
  user?: { id: number; subjectIdentifier: string; name: string } | null;
} = {}) {
  const auditLogs: LoginWithMobileDeps["auditLogWriter"] extends {
    recordAuditLog: (input: infer T) => Promise<void>;
  } ? T[] : never = [];
  const humanRiskFailures: unknown[][] = [];
  const ensureActionAllowed = mock(async () => undefined);
  const consumeVerificationCode = mock(async () => overrides.codeValid ?? false);
  const getRestriction = mock(async () => overrides.restriction ?? null);
  const recordFailure = mock(async () => ({
    failureCount: 5,
    remainingAttempts: 0,
    restriction: temporaryRestriction("mobile"),
  }));
  const clearLoginState = mock(async () => undefined);
  const createPrincipalSession = mock(async () => ({ token: "session-token" }));
  const recordAuditLog = mock(async (input) => {
    auditLogs.push(input);
  });
  const deps: LoginWithMobileDeps = {
    auditLogWriter: { recordAuditLog },
    config: { magicCode: "MAGIC" },
    humanRisk: {
      recordLoginFailure: mock(async (...args) => {
        humanRiskFailures.push(args);
      }),
    },
    humanVerification: { ensureActionAllowed },
    loginRestriction: {
      clearLoginState,
      getRestriction,
      recordFailure,
    },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByMobile: mock(async () => overrides.user === undefined
        ? { id: userDetail.id, name: userDetail.name, subjectIdentifier }
        : overrides.user),
      getUserDetailById: mock(async () => userDetail),
    },
    verificationCodes: { consumeVerificationCode },
  };

  return {
    auditLogs,
    clearLoginState,
    consumeVerificationCode,
    createPrincipalSession,
    deps,
    ensureActionAllowed,
    getRestriction,
    humanRiskFailures,
    recordAuditLog,
    recordFailure,
  };
}

describe("createLoginWithMobileUseCase", () => {
  test("successful mobile login checks and atomically clears shared restriction state", async () => {
    const fixture = createFixture({ codeValid: true });
    const useCase = createLoginWithMobileUseCase(fixture.deps);
    const longUserAgent = `mobile-browser/${"x".repeat(600)}`;

    await expect(useCase.execute({
      code: "1234",
      phoneNumber: userDetail.mobile,
    }, {
      requestContext: {
        sourceApp: "iam",
        requestId: "req-mobile",
        traceId: null,
        ip: "203.0.113.12",
        userAgent: longUserAgent,
        route: "/auth/login/mobile",
        method: "POST",
      },
    })).resolves.toEqual({
      isMobileSet: true,
      token: "session-token",
    });

    expect(fixture.consumeVerificationCode).toHaveBeenCalledWith("login", userDetail.mobile, "1234");
    expect(fixture.getRestriction).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.clearLoginState).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
      amr: ["sms"],
      origin: {
        ip: "203.0.113.12",
        userAgent: longUserAgent.slice(0, 512),
      },
    });
  });

  test("rejects replay after the verification code has been consumed", async () => {
    const fixture = createFixture();
    fixture.consumeVerificationCode
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .resolves
      .toEqual({ isMobileSet: true, token: "session-token" });
    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("验证码错误");

    expect(fixture.consumeVerificationCode).toHaveBeenCalledTimes(2);
  });

  test("invalid code delegates one atomic failure transition with the mobile trigger method", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "0000", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("最后触发方式：手机验证码");

    expect(fixture.humanRiskFailures).toEqual([
      ["mobileLogin", {
        subject: userDetail.mobile,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
    ]);
    expect(fixture.recordFailure).toHaveBeenCalledWith({
      triggerMethod: "mobile",
      userId: userDetail.id,
    });
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "invalid_verification_code" },
      outcome: "failure",
    });
  });

  test("does not attach an invalid-code failure to an unknown user", async () => {
    const fixture = createFixture({ user: null });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "0000", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("验证码错误");

    expect(fixture.humanRiskFailures).toHaveLength(1);
    expect(fixture.recordFailure).not.toHaveBeenCalled();
  });

  test("preserves user-not-found after a valid code for an unknown mobile", async () => {
    const fixture = createFixture({ codeValid: true, user: null });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("用户不存在");

    expect(fixture.recordFailure).not.toHaveBeenCalled();
  });

  test("Temporary Login Restriction prevents code consumption with the canonical audit reason", async () => {
    const fixture = createFixture({ restriction: temporaryRestriction("password") });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("最后触发方式：密码");

    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "too_many_login_failures" },
      outcome: "failure",
    });
  });

  test("fails closed when Temporary Login Restriction state cannot be confirmed", async () => {
    const fixture = createFixture();
    fixture.getRestriction.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toMatchObject({
        code: "LOGIN_PROTECTION_UNAVAILABLE",
        httpStatus: 503,
      });

    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "login_protection_unavailable" },
      outcome: "failure",
    });
  });

  test("keeps the fixed unavailable response when its audit write also fails", async () => {
    const fixture = createFixture();
    fixture.getRestriction.mockRejectedValue(loginRestrictionUnavailable());
    fixture.recordAuditLog.mockRejectedValue(new Error("audit database unavailable"));
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toMatchObject({
        code: "LOGIN_PROTECTION_UNAVAILABLE",
        httpStatus: 503,
      });

    expect(fixture.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
  });

  test("does not misclassify an unexpected restriction-port error as an infrastructure outage", async () => {
    const cause = new Error("unexpected adapter bug");
    const fixture = createFixture();
    fixture.getRestriction.mockRejectedValue(cause);
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toBe(cause);

    expect(fixture.auditLogs).toEqual([]);
  });

  test("failure-state write errors are not audited as invalid codes or a real restriction", async () => {
    const fixture = createFixture();
    fixture.recordFailure.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "0000", phoneNumber: userDetail.mobile }))
      .rejects
      .toMatchObject({
        code: "LOGIN_PROTECTION_UNAVAILABLE",
        httpStatus: 503,
      });

    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "login_protection_unavailable" },
      outcome: "failure",
    });
  });

  test("successful code does not create a session when shared state cannot be cleared", async () => {
    const fixture = createFixture({ codeValid: true });
    fixture.clearLoginState.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toMatchObject({
        code: "LOGIN_PROTECTION_UNAVAILABLE",
        httpStatus: 503,
      });

    expect(fixture.createPrincipalSession).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "login_protection_unavailable" },
      outcome: "failure",
    });
  });

  test("accepts the configured magic code without consuming or recording a failure", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "MAGIC", phoneNumber: userDetail.mobile }))
      .resolves
      .toEqual({ isMobileSet: true, token: "session-token" });

    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.recordFailure).not.toHaveBeenCalled();
    expect(fixture.clearLoginState).toHaveBeenCalledWith(userDetail.id);
  });

  test("stops before lookup when human verification is required", async () => {
    const fixture = createFixture();
    fixture.ensureActionAllowed.mockRejectedValue(new CustomError("需要人机校验", {
      code: ApiErrorCode.HumanVerificationRequired,
    }));
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({
      capToken: "invalid-cap-token",
      code: "0000",
      phoneNumber: userDetail.mobile,
    })).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(fixture.deps.users.getActiveUserByMobile).not.toHaveBeenCalled();
    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toHaveLength(0);
  });
});
