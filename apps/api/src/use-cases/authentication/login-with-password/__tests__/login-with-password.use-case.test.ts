import type { LoginWithPasswordDeps } from "../login-with-password.port";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createLoginWithPasswordUseCase } from "../login-with-password.use-case";

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

function createFixture(overrides: {
  blacklisted?: boolean;
  passwordMatches?: boolean;
  user?: { id: number; username: string; name: string } | null;
} = {}) {
  const auditLogs: LoginWithPasswordDeps["auditLogWriter"] extends {
    recordAuditLog: (input: infer T) => Promise<void>;
  } ? T[] : never = [];
  const humanRiskFailures: unknown[][] = [];
  const ensureActionAllowed = mock(async () => undefined);
  const recordLoginFailure = mock(async () => ({
    failureCount: 5,
    remainingAttempts: 0,
    shouldBlacklist: true,
  }));
  const blacklistLoginUser = mock(async () => undefined);
  const deps: LoginWithPasswordDeps = {
    auditLogWriter: {
      recordAuditLog: mock(async (input) => {
        auditLogs.push(input);
      }),
    },
    config: { magicCode: "MAGIC" },
    humanRisk: {
      recordLoginFailure: mock(async (...args) => {
        humanRiskFailures.push(args);
      }),
    },
    humanVerification: { ensureActionAllowed },
    loginFailure: {
      blacklistLoginUser,
      clearLoginBlacklist: mock(async () => undefined),
      clearLoginFailures: mock(async () => undefined),
      formatLoginBlacklistMessage: mock(async () => "账号已被临时限制"),
      formatLoginFailureMessage: mock(prefix => `${prefix}，当前已连续失败 5 次`),
      isLoginUserBlacklisted: mock(async () => overrides.blacklisted ?? false),
      recordLoginFailure,
    },
    principalSessions: {
      createPrincipalSession: mock(async () => ({ token: "session-token" })),
    },
    users: {
      checkPassword: mock(async () => overrides.passwordMatches ?? false),
      getActiveUserByUsername: mock(async () => overrides.user === undefined
        ? { id: userDetail.id, username: userDetail.username, name: userDetail.name }
        : overrides.user),
      getUserDetailById: mock(async () => userDetail),
    },
  };
  return {
    auditLogs,
    blacklistLoginUser,
    deps,
    ensureActionAllowed,
    humanRiskFailures,
    recordLoginFailure,
  };
}

describe("createLoginWithPasswordUseCase", () => {
  test("executes the successful password-login workflow in order", async () => {
    const events: string[] = [];
    const createPrincipalSession = mock(async () => {
      events.push("session");
      return { token: "session-token" };
    });
    const useCase = createLoginWithPasswordUseCase({
      auditLogWriter: {
        recordAuditLog: mock(async () => {
          events.push("audit");
        }),
      },
      config: { magicCode: "MAGIC" },
      humanRisk: { recordLoginFailure: mock(async () => undefined) },
      humanVerification: {
        ensureActionAllowed: mock(async () => {
          events.push("human-verification");
        }),
      },
      loginFailure: {
        blacklistLoginUser: mock(async () => undefined),
        clearLoginBlacklist: mock(async () => {
          events.push("clear-blacklist");
        }),
        clearLoginFailures: mock(async () => {
          events.push("clear-failures");
        }),
        formatLoginBlacklistMessage: mock(async () => "blacklisted"),
        formatLoginFailureMessage: mock(() => "failure"),
        isLoginUserBlacklisted: mock(async () => {
          events.push("blacklist-check");
          return false;
        }),
        recordLoginFailure: mock(async () => ({
          failureCount: 1,
          remainingAttempts: 4,
          shouldBlacklist: false,
        })),
      },
      principalSessions: { createPrincipalSession },
      users: {
        checkPassword: mock(async () => {
          events.push("password-check");
          return true;
        }),
        getActiveUserByUsername: mock(async () => {
          events.push("user-lookup");
          return {
            id: userDetail.id,
            username: userDetail.username,
            name: userDetail.name,
          };
        }),
        getUserDetailById: mock(async () => {
          events.push("user-detail");
          return userDetail;
        }),
      },
    });

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).resolves.toEqual({
      isMobileSet: true,
      token: "session-token",
    });

    expect(events).toEqual([
      "human-verification",
      "user-lookup",
      "blacklist-check",
      "password-check",
      "user-detail",
      "clear-failures",
      "clear-blacklist",
      "session",
      "audit",
    ]);
    expect(createPrincipalSession).toHaveBeenCalledWith(userDetail, { amr: ["pwd"] });
  });

  test("records risk, audit, failure count, and blacklist before rejecting an invalid password", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "wrong-password",
      username: userDetail.username,
    })).rejects.toThrow(
      "密码错误，当前已连续失败 5 次，账号已被临时限制",
    );

    expect(fixture.humanRiskFailures).toEqual([
      ["passwordLogin", {
        subject: userDetail.username,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
    ]);
    expect(fixture.auditLogs).toHaveLength(1);
    expect(fixture.auditLogs[0]).toMatchObject({
      action: "auth.login.password",
      details: { reason: "invalid_password" },
      outcome: "failure",
    });
    expect(fixture.recordLoginFailure).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.blacklistLoginUser).toHaveBeenCalledWith(userDetail.id, "password");
  });

  test("audits a blacklist rejection without checking the password", async () => {
    const fixture = createFixture({ blacklisted: true });
    const useCase = createLoginWithPasswordUseCase(fixture.deps);

    await expect(useCase.execute({
      password: "correct-password",
      username: userDetail.username,
    })).rejects.toThrow("账号已被临时限制");

    expect(fixture.deps.users.checkPassword).not.toHaveBeenCalled();
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "blacklisted" },
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

    expect(fixture.recordLoginFailure).not.toHaveBeenCalled();
    expect(fixture.humanRiskFailures).toHaveLength(0);
  });
});
