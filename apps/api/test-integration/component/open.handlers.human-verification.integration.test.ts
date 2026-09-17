import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createOpenHandlers } from "@api/routes/open/open.handlers";
import { createOpenRoute } from "@api/routes/open/open.index";
import { SmsCooldownError, SmsSendFailedError, SmsUnavailableError } from "@api/services/mobile/mobile.error";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import { ApiErrorCode } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

type ValidTarget = "json" | "query" | "param";

const ensureActionAllowed = mock(async () => undefined);
const recordOpenUserInfoLookup = mock(async () => undefined);
const checkVerificationCode = mock(async () => true);
const sendCode = mock(async () => true);
const recordAuditLog = mock(async () => undefined);
const recordAuditLogFromContext = mock(async () => undefined);
const getUserMobileByUsername = mock(async (): Promise<string | null> => "17721462865");
const requestPasswordResetCode = mock(async () => true);
const verifyPasswordResetCode = mock(async () => true);
const resetAccountPassword = mock(async () => true);

function createHandlers() {
  return createOpenHandlers({
    accountRecovery: {
      requestPasswordResetCode: { execute: requestPasswordResetCode },
      resetPassword: { execute: resetAccountPassword },
      verifyPasswordResetCode: { execute: verifyPasswordResetCode },
    },
    auditLogWriter: {
      recordAuditLog,
      recordAuditLogFromContext,
    },
    clientService: {
      getClientByCode: mock(async () => null),
    },
    humanVerification: {
      createChallenge: mock(async () => ({ challenge: { c: 1, s: 2, d: 3 }, expires: 1000 })),
      ensureActionAllowed,
      isValidSiteKey: mock(() => true),
      redeemChallenge: mock(async () => ({ success: true })),
    },
    humanRiskService: {
      recordOpenUserInfoLookup,
    },
    mobileService: {
      checkVerificationCode,
      sendCode,
    },
    userService: {
      getUserMobileByUsername,
    },
  } as any);
}

function makeContext(input: Partial<Record<ValidTarget, unknown>>) {
  return {
    req: {
      header: mock((name: string) => name.toLowerCase() === "client" ? "iam" : undefined),
      method: "POST",
      path: "/open/code/send",
      raw: new Request("https://iam.example.test/open/code/send"),
      valid: mock((target: ValidTarget) => input[target]),
    },
    get: mock((name: string) => name === "requestId" ? "req-1" : undefined),
    json: mock((data: unknown) => data),
  };
}

beforeEach(() => {
  ensureActionAllowed.mockReset();
  ensureActionAllowed.mockResolvedValue(undefined);
  recordOpenUserInfoLookup.mockReset();
  recordOpenUserInfoLookup.mockResolvedValue(undefined);
  checkVerificationCode.mockReset();
  checkVerificationCode.mockResolvedValue(true);
  sendCode.mockReset();
  sendCode.mockResolvedValue(true);
  recordAuditLog.mockReset();
  recordAuditLog.mockResolvedValue(undefined);
  recordAuditLogFromContext.mockReset();
  recordAuditLogFromContext.mockResolvedValue(undefined);
  getUserMobileByUsername.mockReset();
  getUserMobileByUsername.mockResolvedValue("17721462865");
  requestPasswordResetCode.mockClear();
  verifyPasswordResetCode.mockClear();
  resetAccountPassword.mockClear();
});

describe("createOpenHandlers human verification", () => {
  test.each([
    [new SmsCooldownError(37), 429, "37"],
    [new SmsSendFailedError(50), 500, "50"],
    [new SmsUnavailableError(), 503, null],
  ] as const)("serializes SMS error %s with its retry delay", async (error, status, retryAfter) => {
    sendCode.mockRejectedValueOnce(error);
    const app = createOpenRoute(createHandlers());
    app.onError(createErrorHandler({ info() {}, warn() {}, error() {} }));
    const response = await app.request("/code/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "13800000000", usage: "login" }),
    });
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe(retryAfter);
    expect(body).toMatchObject({ code: error.code });
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  test("does not send an SMS code when Cap verification is required", async () => {
    const handlers = createHandlers();
    ensureActionAllowed.mockRejectedValue(Object.assign(new Error("需要人机校验"), {
      code: ApiErrorCode.HumanVerificationRequired,
    }));

    await expect(handlers.codeSend(makeContext({
      json: {
        capToken: undefined,
        phoneNumber: "17721462865",
        usage: VerificationCodeUsage.Login,
      },
    }) as never, undefined as never)).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(sendCode).not.toHaveBeenCalled();
  });

  test("sends an SMS code after Cap verification succeeds", async () => {
    const handlers = createHandlers();

    const result = await handlers.codeSend(makeContext({
      json: {
        capToken: "cap-token",
        phoneNumber: "17721462865",
        usage: VerificationCodeUsage.Login,
      },
    }) as never, undefined as never);

    expect(result as unknown).toEqual({
      code: 200,
      data: true,
      message: "success",
    });
    expect(ensureActionAllowed).toHaveBeenCalled();
    expect(sendCode).toHaveBeenCalledWith("17721462865", VerificationCodeUsage.Login);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "auth.sms_code.send",
      outcome: "success",
      requestId: "req-1",
      traceId: null,
      details: {
        phoneNumber: "177****2865",
        usage: VerificationCodeUsage.Login,
        username: undefined,
      },
    }));
  });

  test("sends a bind-phone code to the provided mobile", async () => {
    const handlers = createHandlers();

    await handlers.codeSend(makeContext({
      json: {
        capToken: "cap-token",
        phoneNumber: "17721462865",
        usage: VerificationCodeUsage.BindPhone,
      },
    }) as never, undefined as never);

    expect(sendCode).toHaveBeenCalledWith("17721462865", VerificationCodeUsage.BindPhone);
  });

  test("dispatches password-reset code requests to the Account Recovery use-case", async () => {
    const handlers = createHandlers();

    await handlers.codeSend(makeContext({
      json: {
        capToken: "cap-token",
        phoneNumber: "177****2865",
        username: "zhangsan",
        usage: VerificationCodeUsage.ResetPassword,
      },
    }) as never, undefined as never);

    expect(requestPasswordResetCode).toHaveBeenCalledWith({
      phoneNumber: "177****2865",
      username: "zhangsan",
    }, {
      requestContext: expect.objectContaining({ requestId: "req-1" }),
    });
  });

  test("does not query masked mobile when Cap verification is required", async () => {
    const handlers = createHandlers();
    ensureActionAllowed.mockRejectedValue(Object.assign(new Error("需要人机校验"), {
      code: ApiErrorCode.HumanVerificationRequired,
    }));

    await expect(handlers.maskedMobile(makeContext({
      param: { username: "zhangsan" },
      query: {},
    }) as never, undefined as never)).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(getUserMobileByUsername).not.toHaveBeenCalled();
    expect(recordOpenUserInfoLookup).not.toHaveBeenCalled();
  });

  test("returns only masked mobile through the resource route after Cap verification succeeds", async () => {
    const app = createOpenRoute(createHandlers());
    const response = await app.request("/users/zhangsan/masked-mobile?capToken=cap-token");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({
      code: 200,
      data: {
        mobile: "177****2865",
      },
      message: "success",
    });
    expect(recordOpenUserInfoLookup).toHaveBeenCalled();
    expect(getUserMobileByUsername).toHaveBeenCalledWith("zhangsan");
    expect(ensureActionAllowed).toHaveBeenCalledWith("openUserInfoLookup", "cap-token", expect.any(Object));
  });

  test("returns a successful null mobile without extra user fields", async () => {
    getUserMobileByUsername.mockResolvedValue(null);
    const response = await createOpenRoute(createHandlers()).request("/users/unknown/masked-mobile");
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toEqual({ code: 200, data: { mobile: null }, message: "success" });
  });

  test.each([
    ["张 三", "%25E5%25BC%25A0%2520%25E4%25B8%2589"],
    ["a/b?c#d%", "a%252Fb%253Fc%2523d%2525"],
    ["a@example.com", "a%2540example%252Ecom"],
    [".", "%252E"],
    ["..", "%252E%252E"],
    ["%2E", "%25252E"],
  ])("decodes username path segments: %s", async (username, segment) => {
    const response = await createOpenRoute(createHandlers()).request(`/users/${segment}/masked-mobile`);
    expect(response.status).toBe(200);
    expect(getUserMobileByUsername).toHaveBeenCalledWith(username);
  });

  test("returns the Account Recovery verification result without consuming in the route", async () => {
    const handlers = createHandlers();

    const result = await handlers.codeVerify(makeContext({
      json: {
        code: "123456",
        phoneNumber: "17721462865",
        username: "zhangsan",
        usage: VerificationCodeUsage.ResetPassword,
      },
    }) as never, undefined as never);

    expect(result as unknown).toEqual({
      code: 200,
      data: { result: true },
      message: "success",
    });
  });

  test("dispatches password-reset code verification to the Account Recovery use-case", async () => {
    const handlers = createHandlers();

    await handlers.codeVerify(makeContext({
      json: {
        code: "123456",
        phoneNumber: "177****2865",
        username: "zhangsan",
        usage: VerificationCodeUsage.ResetPassword,
      },
    }) as never, undefined as never);

    expect(verifyPasswordResetCode).toHaveBeenCalledWith({
      code: "123456",
      phoneNumber: "177****2865",
      username: "zhangsan",
    }, {
      requestContext: expect.objectContaining({ requestId: "req-1" }),
    });
  });

  test("verifies a login code against the login Redis namespace", async () => {
    const handlers = createHandlers();

    await handlers.codeVerify(makeContext({
      json: {
        code: "123456",
        phoneNumber: "17721462865",
        usage: VerificationCodeUsage.Login,
      },
    }) as never, undefined as never);

    expect(checkVerificationCode).toHaveBeenCalledWith(
      VerificationCodeUsage.Login,
      "17721462865",
      "123456",
    );
  });

  test("verifies a bind-phone code against the bind-phone Redis namespace", async () => {
    const handlers = createHandlers();

    await handlers.codeVerify(makeContext({
      json: {
        code: "123456",
        phoneNumber: "17721462865",
        usage: VerificationCodeUsage.BindPhone,
      },
    }) as never, undefined as never);

    expect(checkVerificationCode).toHaveBeenCalledWith(
      VerificationCodeUsage.BindPhone,
      "17721462865",
      "123456",
    );
  });

  test("dispatches password reset to the Account Recovery use-case", async () => {
    const handlers = createHandlers();

    await handlers.passwordReset(makeContext({
      json: {
        code: "123456",
        newPassword: "newPass123",
        phoneNumber: "17721462865",
        username: "zhangsan",
      },
    }) as never, undefined as never);

    expect(resetAccountPassword).toHaveBeenCalledWith({
      code: "123456",
      newPassword: "newPass123",
      phoneNumber: "17721462865",
      username: "zhangsan",
    }, {
      requestContext: expect.objectContaining({
        requestId: "req-1",
        sourceApp: "iam",
      }),
    });
  });
});
