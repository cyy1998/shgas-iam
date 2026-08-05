import type { LoginWithPasswordDeps } from "@api/use-cases/authentication/login-with-password/login-with-password.port";
import { createLoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { LoginRestrictionUnavailableError } from "@iam/api-core/login-restriction";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

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
  triggerMethod: "mobile" | "password" | "unknown" = "password",
) {
  return {
    remainingSeconds: 30 * 60,
    triggerMethod,
  };
}

function createFixture(overrides: {
  passwordMatches?: boolean;
  restriction?: ReturnType<typeof temporaryRestriction> | null;
  user?: { id: number; subjectIdentifier: string; username: string; name: string } | null;
} = {}) {
  const auditLogs: LoginWithPasswordDeps["auditLogWriter"] extends {
    recordAuditLog: (input: infer T) => Promise<void>;
  } ? T[] : never = [];
  const humanRiskFailures: unknown[][] = [];
  const ensureActionAllowed = mock(async () => undefined);
  const getRestriction = mock(async () => overrides.restriction ?? null);
  const recordFailure = mock(async () => ({
    failureCount: 5,
    remainingAttempts: 0,
    restriction: temporaryRestriction("password"),
  }));
  const clearLoginState = mock(async () => undefined);
  const createPrincipalSession = mock(async () => ({ token: "session-token" }));
  const recordAuditLog = mock(async (input) => {
    auditLogs.push(input);
  });
  const deps: LoginWithPasswordDeps = {
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
      checkPassword: mock(async () => overrides.passwordMatches ?? false),
      getActiveUserByUsername: mock(async () => overrides.user === undefined
        ? { id: userDetail.id, username: userDetail.username, name: userDetail.name, subjectIdentifier }
        : overrides.user),
      getUserDetailById: mock(async () => userDetail),
    },
  };

  return {
    auditLogs,
    clearLoginState,
    createPrincipalSession,
    deps,
    ensureActionAllowed,
    getRestriction,
    humanRiskFailures,
    recordAuditLog,
    recordFailure,
  };
}

describe("createLoginWithPasswordUseCase", () => {
  test("successful password login checks and atomically clears shared restriction state", async () => {
    const fixture = createFixture({ passwordMatches: true });
    const useCase = createLoginWithPasswordUseCase(fixture.deps);
    const longUserAgent = `password-browser/${"x".repeat(600)}`;

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    }, {
      requestContext: {
        sourceApp: "iam",
        requestId: "req-password",
        traceId: null,
        ip: "203.0.113.11",
        userAgent: longUserAgent,
        route: "/auth/login/password",
        method: "POST",
      },
    })).resolves.toEqual({
      isMobileSet: true,
      token: "session-token",
    });

    expect(fixture.getRestriction).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.clearLoginState).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
      amr: ["pwd"],
      origin: {
        ip: "203.0.113.11",
        userAgent: longUserAgent.slice(0, 512),
      },
    });
  });

  test("invalid password delegates one atomic failure transition with the password trigger method", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "wrong-password",
      username: userDetail.username,
    })).rejects.toThrow("最后触发方式：密码");

    expect(fixture.humanRiskFailures).toEqual([
      ["passwordLogin", {
        subject: userDetail.username,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
    ]);
    expect(fixture.recordFailure).toHaveBeenCalledWith({
      triggerMethod: "password",
      userId: userDetail.id,
    });
    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      action: "auth.login.password",
      details: { reason: "invalid_password" },
      outcome: "failure",
    });
  });

  test("Temporary Login Restriction prevents password verification with the canonical audit reason", async () => {
    const fixture = createFixture({ restriction: temporaryRestriction("mobile") });
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toThrow("最后触发方式：手机验证码");

    expect(fixture.deps.users.checkPassword).not.toHaveBeenCalled();
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "too_many_login_failures" },
      outcome: "failure",
    });
  });

  test("fails closed when Temporary Login Restriction state cannot be confirmed", async () => {
    const fixture = createFixture();
    fixture.getRestriction.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toMatchObject({
      code: "LOGIN_PROTECTION_UNAVAILABLE",
      httpStatus: 503,
    });

    expect(fixture.deps.users.checkPassword).not.toHaveBeenCalled();
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
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toMatchObject({
      code: "LOGIN_PROTECTION_UNAVAILABLE",
      httpStatus: 503,
    });

    expect(fixture.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(fixture.deps.users.checkPassword).not.toHaveBeenCalled();
  });

  test("does not misclassify an unexpected restriction-port error as an infrastructure outage", async () => {
    const cause = new Error("unexpected adapter bug");
    const fixture = createFixture();
    fixture.getRestriction.mockRejectedValue(cause);
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toBe(cause);

    expect(fixture.auditLogs).toEqual([]);
  });

  test("failure-state write errors are not audited as invalid credentials or a real restriction", async () => {
    const fixture = createFixture();
    fixture.recordFailure.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "wrong-password",
      username: userDetail.username,
    })).rejects.toMatchObject({
      code: "LOGIN_PROTECTION_UNAVAILABLE",
      httpStatus: 503,
    });

    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "login_protection_unavailable" },
      outcome: "failure",
    });
  });

  test("successful credentials do not create a session when shared state cannot be cleared", async () => {
    const fixture = createFixture({ passwordMatches: true });
    fixture.clearLoginState.mockRejectedValue(loginRestrictionUnavailable());
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toMatchObject({
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

  test("records lookup risk and audit while preserving a user-not-found error", async () => {
    const fixture = createFixture({ user: null });
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "wrong-password",
      username: "missing-user",
    })).rejects.toThrow("用户不存在");

    expect(fixture.humanRiskFailures).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "user_lookup_failed", username: "missing-user" },
      outcome: "failure",
    });
  });

  test("stops before lookup when human verification is required", async () => {
    const fixture = createFixture();
    fixture.ensureActionAllowed.mockRejectedValue(new CustomError("需要人机校验", {
      code: ApiErrorCode.HumanVerificationRequired,
    }));
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      capToken: "invalid-cap-token",
      password: "wrong-password",
      username: userDetail.username,
    })).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(fixture.deps.users.getActiveUserByUsername).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toHaveLength(0);
    expect(fixture.humanRiskFailures).toHaveLength(0);
  });

  test("accepts the configured magic code without recording credential failure", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "MAGIC",
      username: userDetail.username,
    })).resolves.toEqual({ isMobileSet: true, token: "session-token" });

    expect(fixture.recordFailure).not.toHaveBeenCalled();
    expect(fixture.humanRiskFailures).toHaveLength(0);
    expect(fixture.clearLoginState).toHaveBeenCalledWith(userDetail.id);
  });
});
