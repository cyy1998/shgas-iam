import type { LoginWithMobileDeps } from "../login-with-mobile.port";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createLoginWithMobileUseCase } from "../login-with-mobile.use-case";

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
  codeValid?: boolean;
  shouldBlacklist?: boolean;
  user?: { id: number; name: string } | null;
} = {}) {
  const auditLogs: LoginWithMobileDeps["auditLogWriter"] extends {
    recordAuditLog: (input: infer T) => Promise<void>;
  } ? T[] : never = [];
  const humanRiskFailures: unknown[][] = [];
  const ensureActionAllowed = mock(async () => undefined);
  const consumeVerificationCode = mock(async () => overrides.codeValid ?? false);
  const recordLoginFailure = mock(async () => ({
    failureCount: overrides.shouldBlacklist ? 5 : 1,
    remainingAttempts: overrides.shouldBlacklist ? 0 : 4,
    shouldBlacklist: overrides.shouldBlacklist ?? false,
  }));
  const blacklistLoginUser = mock(async () => undefined);
  const deps: LoginWithMobileDeps = {
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
      formatLoginFailureMessage: mock(prefix => `${prefix}，当前已连续失败 ${overrides.shouldBlacklist ? 5 : 1} 次`),
      isLoginUserBlacklisted: mock(async () => overrides.blacklisted ?? false),
      recordLoginFailure,
    },
    principalSessions: {
      createPrincipalSession: mock(async () => ({ token: "session-token" })),
    },
    users: {
      getActiveUserByMobile: mock(async () => overrides.user === undefined
        ? { id: userDetail.id, name: userDetail.name }
        : overrides.user),
      getUserDetailById: mock(async () => userDetail),
    },
    verificationCodes: { consumeVerificationCode },
  };
  return {
    auditLogs,
    blacklistLoginUser,
    consumeVerificationCode,
    deps,
    ensureActionAllowed,
    humanRiskFailures,
    recordLoginFailure,
  };
}

describe("createLoginWithMobileUseCase", () => {
  test("atomically consumes the code and creates an sms principal session in order", async () => {
    const events: string[] = [];
    const consumeVerificationCode = mock(async () => {
      events.push("consume-code");
      return true;
    });
    const createPrincipalSession = mock(async () => {
      events.push("session");
      return { token: "session-token" };
    });
    const useCase = createLoginWithMobileUseCase({
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
        getActiveUserByMobile: mock(async () => {
          events.push("user-lookup");
          return { id: userDetail.id, name: userDetail.name };
        }),
        getUserDetailById: mock(async () => {
          events.push("user-detail");
          return userDetail;
        }),
      },
      verificationCodes: { consumeVerificationCode },
    });

    await expect(useCase.execute({
      code: "1234",
      phoneNumber: userDetail.mobile,
    })).resolves.toEqual({
      isMobileSet: true,
      token: "session-token",
    });

    expect(events).toEqual([
      "human-verification",
      "user-lookup",
      "blacklist-check",
      "consume-code",
      "user-detail",
      "clear-failures",
      "clear-blacklist",
      "session",
      "audit",
    ]);
    expect(consumeVerificationCode).toHaveBeenCalledWith("login", userDetail.mobile, "1234");
    expect(createPrincipalSession).toHaveBeenCalledWith(userDetail, { amr: ["sms"] });
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

  test("shares failure state and blacklists a known user after an invalid code", async () => {
    const fixture = createFixture({ shouldBlacklist: true });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "0000", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("验证码错误，当前已连续失败 5 次，账号已被临时限制");

    expect(fixture.humanRiskFailures).toEqual([
      ["mobileLogin", {
        subject: userDetail.mobile,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
    ]);
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "invalid_verification_code" },
      outcome: "failure",
    });
    expect(fixture.recordLoginFailure).toHaveBeenCalledWith(userDetail.id);
    expect(fixture.blacklistLoginUser).toHaveBeenCalledWith(userDetail.id, "mobile");
  });

  test("does not attach an invalid-code failure to an unknown user", async () => {
    const fixture = createFixture({ user: null });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "0000", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("验证码错误");

    expect(fixture.humanRiskFailures).toHaveLength(1);
    expect(fixture.recordLoginFailure).not.toHaveBeenCalled();
    expect(fixture.blacklistLoginUser).not.toHaveBeenCalled();
  });

  test("preserves user-not-found after a valid code for an unknown mobile", async () => {
    const fixture = createFixture({ codeValid: true, user: null });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("用户不存在");

    expect(fixture.recordLoginFailure).not.toHaveBeenCalled();
  });

  test("audits a blacklist rejection before consuming a code", async () => {
    const fixture = createFixture({ blacklisted: true });
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "1234", phoneNumber: userDetail.mobile }))
      .rejects
      .toThrow("账号已被临时限制");

    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.auditLogs[0]).toMatchObject({
      details: { reason: "blacklisted" },
      outcome: "failure",
    });
  });

  test("accepts the configured magic code without consuming a verification code", async () => {
    const fixture = createFixture();
    const useCase = createLoginWithMobileUseCase(fixture.deps);

    await expect(useCase.execute({ code: "MAGIC", phoneNumber: userDetail.mobile }))
      .resolves
      .toEqual({ isMobileSet: true, token: "session-token" });

    expect(fixture.consumeVerificationCode).not.toHaveBeenCalled();
    expect(fixture.recordLoginFailure).not.toHaveBeenCalled();
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
