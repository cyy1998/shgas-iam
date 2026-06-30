import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { ApiErrorCode } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createOpenHandlers } from "../open.handlers";

type ValidTarget = "json" | "query" | "param";

const ensureActionAllowed = mock(async () => undefined);
const recordOpenUserInfoLookup = mock(async () => undefined);
const checkVerificationCode = mock(async () => true);
const sendCode = mock(async () => true);
const recordAuditLog = mock(async () => undefined);
const recordAuditLogFromContext = mock(async () => undefined);
const getUserDetailByUsername = mock(async () => ({
  mobile: "17721462865",
  name: "张三",
  username: "zhangsan",
}));
const resetPassword = mock(async () => true);
const resolveResetPasswordMobile = mock(async (_username: string, phoneNumber?: string) => phoneNumber ?? "17721462865");
const requirePhoneNumber = mock((phoneNumber?: string) => {
  if (!phoneNumber)
    throw new Error("手机号不能为空");
  return phoneNumber;
});

function createHandlers() {
  return createOpenHandlers({
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
    openService: {
      maskMobile: mock((mobile: string | null) => mobile?.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") ?? null),
      requirePhoneNumber,
      resolveResetPasswordMobile,
    },
    userService: {
      getUserDetailByUsername,
      resetPassword,
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
  getUserDetailByUsername.mockReset();
  getUserDetailByUsername.mockResolvedValue({
    mobile: "17721462865",
    name: "张三",
    username: "zhangsan",
  });
  resetPassword.mockClear();
  resolveResetPasswordMobile.mockClear();
  requirePhoneNumber.mockClear();
});

describe("createOpenHandlers human verification", () => {
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

  test("does not query user info when Cap verification is required", async () => {
    const handlers = createHandlers();
    ensureActionAllowed.mockRejectedValue(Object.assign(new Error("需要人机校验"), {
      code: ApiErrorCode.HumanVerificationRequired,
    }));

    await expect(handlers.userInfo(makeContext({
      query: {
        username: "zhangsan",
      },
    }) as never, undefined as never)).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(getUserDetailByUsername).not.toHaveBeenCalled();
    expect(recordOpenUserInfoLookup).not.toHaveBeenCalled();
  });

  test("returns masked user info after Cap verification succeeds", async () => {
    const handlers = createHandlers();

    const result = await handlers.userInfo(makeContext({
      query: {
        capToken: "cap-token",
        username: "zhangsan",
      },
    }) as never, undefined as never);

    expect(result as unknown).toEqual({
      code: 200,
      data: {
        mobile: "177****2865",
        name: "张三",
        username: "zhangsan",
      },
      message: "success",
    });
    expect(recordOpenUserInfoLookup).toHaveBeenCalled();
    expect(getUserDetailByUsername).toHaveBeenCalledWith("zhangsan");
  });

  test("verifies SMS codes without consuming them", async () => {
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
    expect(checkVerificationCode).toHaveBeenCalledWith(VerificationCodeUsage.ResetPassword, "17721462865", "123456");
    expect(sendCode).not.toHaveBeenCalled();
  });

  test("passes request context to password reset service", async () => {
    const handlers = createHandlers();

    await handlers.passwordReset(makeContext({
      json: {
        code: "123456",
        newPassword: "newPass123",
        phoneNumber: "17721462865",
        username: "zhangsan",
      },
    }) as never, undefined as never);

    expect(resetPassword).toHaveBeenCalledWith("zhangsan", "17721462865", "123456", "newPass123", {
      requestContext: expect.objectContaining({
        requestId: "req-1",
        sourceApp: "iam",
      }),
    });
  });
});
