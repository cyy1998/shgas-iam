import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

type ValidTarget = "json" | "query" | "param";

function makeContext(input: Partial<Record<ValidTarget, unknown>>) {
  return {
    req: {
      header(name: string) {
        return name.toLowerCase() === "client" ? "iam" : undefined;
      },
      valid(target: ValidTarget) {
        return input[target];
      },
    },
    json(data: unknown) {
      return data;
    },
  };
}

const ensureActionAllowed = mock(async () => undefined);
const recordOpenUserInfoLookup = mock(async () => undefined);
const sendCode = mock(async () => true);
const getUserDetailByUsername = mock(async () => ({
  mobile: "17721462865",
  name: "张三",
  username: "zhangsan",
}));

mock.module("@api/services/human-verification/cap.service", () => ({
  HumanVerificationAction: {
    OpenUserInfoLookup: "openUserInfoLookup",
    SendSmsCode: "sendSmsCode",
  },
  ensureActionAllowed,
}));

mock.module("@api/services/human-verification/human-risk.service", () => ({
  recordOpenUserInfoLookup,
}));

mock.module("@api/services/mobile/mobile.service", () => ({
  sendCode,
}));

mock.module("@api/services/user/user.service", () => ({
  getUserDetailByUsername,
}));

mock.module("@api/services/client/client.service", () => ({
  async getClientByCode() {
    return null;
  },
}));

const handlers = await import("../open.handlers");

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  ensureActionAllowed.mockReset();
  ensureActionAllowed.mockResolvedValue(undefined);
  recordOpenUserInfoLookup.mockReset();
  recordOpenUserInfoLookup.mockResolvedValue(undefined);
  sendCode.mockReset();
  sendCode.mockResolvedValue(true);
  getUserDetailByUsername.mockReset();
  getUserDetailByUsername.mockResolvedValue({
    mobile: "17721462865",
    name: "张三",
    username: "zhangsan",
  });
});

describe("open handlers human verification", () => {
  test("does not send an SMS code when Cap verification is required", async () => {
    ensureActionAllowed.mockRejectedValue(Object.assign(new Error("需要人机校验"), {
      code: ApiErrorCode.HumanVerificationRequired,
      legacyCode: ServiceStatusCode.HumanVerificationRequired,
    }));

    await expect(handlers.codeSend(makeContext({
      json: {
        capToken: undefined,
        phoneNumber: "17721462865",
        usage: "login",
      },
    }) as never, undefined as never)).rejects.toHaveProperty("code", ApiErrorCode.HumanVerificationRequired);

    expect(sendCode).not.toHaveBeenCalled();
  });

  test("sends an SMS code after Cap verification succeeds", async () => {
    const result = await handlers.codeSend(makeContext({
      json: {
        capToken: "cap-token",
        phoneNumber: "17721462865",
        usage: "login",
      },
    }) as never, undefined as never);

    expect(result as unknown).toEqual({
      code: ServiceStatusCode.Success,
      data: true,
      message: "success",
    });

    expect(ensureActionAllowed).toHaveBeenCalled();
    expect(sendCode).toHaveBeenCalledWith("17721462865", "login");
  });

  test("does not query user info when Cap verification is required", async () => {
    ensureActionAllowed.mockRejectedValue(Object.assign(new Error("需要人机校验"), {
      code: ApiErrorCode.HumanVerificationRequired,
      legacyCode: ServiceStatusCode.HumanVerificationRequired,
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
    const result = await handlers.userInfo(makeContext({
      query: {
        capToken: "cap-token",
        username: "zhangsan",
      },
    }) as never, undefined as never);

    expect(result as unknown).toEqual({
      code: ServiceStatusCode.Success,
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
});
