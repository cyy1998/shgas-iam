import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createMemoryRedis } from "@api/testing/fakes";
import { INTERNAL_SERVER_ERROR } from "@iam/api-core/core/http-status-codes";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

function createService() {
  const redis = createMemoryRedis();
  const deadlines = new Map<string, number>();
  let now = 0;
  const cooldown = {
    acquire: mock(async (phone: string) => {
      const remaining = Math.max(0, Math.ceil(((deadlines.get(phone.trim()) ?? 0) - now) / 1000));
      if (remaining === 0)
        deadlines.set(phone.trim(), now + 60_000);
      return remaining;
    }),
    remainingSeconds: mock(async (phone: string) =>
      Math.max(0, Math.ceil(((deadlines.get(phone.trim()) ?? 0) - now) / 1000))),
  };
  const smsSender = {
    sendMessage: mock(async () => true),
    sendVerificationCode: mock(async () => ({ success: true, code: "1234" })),
  };
  const userRepository = {
    getUserByMobile: mock(async () => ({
      id: 1,
      username: "zhangsan",
      name: "张三",
      userType: UserType.Formal,
      password: null,
      mobile: "13800000000",
      wxId: null,
      subjectIdentifier: "",
      status: UserStatus.Enable,
      orderNum: 0,
      isDelete: false,
      createTime: new Date("2026-01-01T00:00:00Z"),
      updateTime: new Date("2026-01-01T00:00:00Z"),
    })),
  };
  const service = createMobileService({
    cooldown,
    redis: redis as any,
    smsSender,
    userRepository,
    config: { verificationCodeTtlSeconds: 180 },
  });
  return {
    redis,
    service,
    smsSender,
    userRepository,
    cooldown,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createMobileService", () => {
  test("reports remaining cooldown after a failed attempt without retrying the provider", async () => {
    const { service, smsSender, advance } = createService();
    smsSender.sendVerificationCode.mockImplementationOnce(async () => {
      advance(10_000);
      throw new DOMException("Timed out", "TimeoutError");
    });
    const result = await Promise.allSettled([service.sendCode("13800000000", VerificationCodeUsage.Login)]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsSendFailed, retryAfterSeconds: 50 } });
    const rejected = await Promise.allSettled([service.sendCode("13800000000", VerificationCodeUsage.BindPhone)]);
    expect(rejected[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown, retryAfterSeconds: 50 } });
    const codeExists = await service.checkVerificationCode("login", "13800000000", "1234");
    expect(codeExists).toBe(false);
    expect(smsSender.sendVerificationCode).toHaveBeenCalledTimes(1);
  });

  test("rejects without contacting the provider when cooldown storage fails", async () => {
    const { service, smsSender, cooldown } = createService();
    cooldown.acquire.mockRejectedValueOnce(new Error("redis down"));
    const result = await Promise.allSettled([service.sendCode("13800000000", VerificationCodeUsage.Login)]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsUnavailable, httpStatus: 503 } });
    expect(smsSender.sendVerificationCode).not.toHaveBeenCalled();
  });

  test("does not invent a retry delay when remaining cooldown cannot be read", async () => {
    const { service, smsSender, cooldown } = createService();
    smsSender.sendVerificationCode.mockRejectedValueOnce(new Error("provider down"));
    cooldown.remainingSeconds.mockRejectedValueOnce(new Error("redis down"));
    const result = await Promise.allSettled([service.sendCode("13800000000", VerificationCodeUsage.Login)]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsUnavailable } });
    if (result[0]?.status === "rejected")
      expect(result[0].reason.retryAfterSeconds).toBeUndefined();
  });

  test("invalid phone validation does not take a sending slot", async () => {
    const { service, cooldown, smsSender } = createService();
    const result = await Promise.allSettled([service.sendCode("not-a-phone", VerificationCodeUsage.Login)]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.InvalidMobile } });
    expect(cooldown.acquire).not.toHaveBeenCalled();
    expect(smsSender.sendVerificationCode).not.toHaveBeenCalled();
  });

  test("sends and stores verification codes", async () => {
    const { redis, service } = createService();

    const sent = await service.sendCode("13800000000", VerificationCodeUsage.Login);
    expect(sent).toBe(true);
    expect(redis.__values.get("mobile-code:login:13800000000")).toBe("1234");
  });

  test("rejects a second send for the same phone across usages", async () => {
    const { service, smsSender } = createService();
    await service.sendCode("13800000000", VerificationCodeUsage.Login);
    let failure: unknown;
    try {
      await service.sendCode("13800000000", VerificationCodeUsage.BindPhone);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ httpStatus: 429, retryAfterSeconds: 60 });
    expect(smsSender.sendVerificationCode).toHaveBeenCalledTimes(1);
  });

  test("classifies provider rejection as a failed send with remaining cooldown", async () => {
    const { service, smsSender } = createService();
    smsSender.sendVerificationCode.mockResolvedValueOnce({ success: false, code: "" });

    const result = await Promise.allSettled([service.sendCode("13800000000", VerificationCodeUsage.Login)]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: {
      code: ApiErrorCode.SmsSendFailed,
      httpStatus: INTERNAL_SERVER_ERROR,
      retryAfterSeconds: 60,
    } });
  });

  test("consumes matching verification code once", async () => {
    const { service } = createService();

    await service.sendCode("13800000000", VerificationCodeUsage.Login);
    const first = await service.consumeVerificationCode(VerificationCodeUsage.Login, "13800000000", "1234");
    const second = await service.consumeVerificationCode(VerificationCodeUsage.Login, "13800000000", "1234");
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test("reserves a matching verification code without deleting it and confirms it once", async () => {
    const { redis, service } = createService();

    await service.sendCode("13800000000", VerificationCodeUsage.ResetPassword);
    const reservation = await service.reserveVerificationCode(
      VerificationCodeUsage.ResetPassword,
      "13800000000",
      "1234",
    );

    expect(reservation).toEqual({
      usage: VerificationCodeUsage.ResetPassword,
      phone: "13800000000",
      token: expect.any(String),
    });
    expect(redis.__values.get("mobile-code:resetPassword:13800000000")).toBe("1234");
    const confirmed = await service.confirmReservedVerificationCode(reservation!);
    expect(confirmed).toBe(true);
    expect(redis.__values.get("mobile-code:resetPassword:13800000000")).toBeUndefined();
    const repeated = await service.confirmReservedVerificationCode(reservation!);
    expect(repeated).toBe(false);
  });

  test("releases a reservation without consuming the original verification code", async () => {
    const { redis, service } = createService();

    await service.sendCode("13800000000", VerificationCodeUsage.BindPhone);
    const reservation = await service.reserveVerificationCode(VerificationCodeUsage.BindPhone, "13800000000", "1234");
    expect(reservation).not.toBeNull();

    await service.releaseReservedVerificationCode(reservation!);

    expect(redis.__values.get("mobile-code:bindPhone:13800000000")).toBe("1234");
    const reserved = await service.reserveVerificationCode(VerificationCodeUsage.BindPhone, "13800000000", "1234");
    expect(reserved).toEqual(expect.objectContaining({ usage: VerificationCodeUsage.BindPhone }));
  });
});
