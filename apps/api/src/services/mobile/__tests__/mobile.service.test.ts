import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createMemoryRedis } from "@api/test/fakes";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createMobileService } from "../mobile.service";

function createService() {
  const redis = createMemoryRedis();
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
      oidcSubject: "",
      status: UserStatus.Enable,
      orderNum: 0,
      isDelete: false,
      createTime: new Date("2026-01-01T00:00:00Z"),
      updateTime: new Date("2026-01-01T00:00:00Z"),
    })),
  };
  const service = createMobileService({
    redis: redis as any,
    smsSender,
    userRepository,
    config: { verificationCodeTtlSeconds: 180 },
  });
  return { redis, service, smsSender, userRepository };
}

describe("createMobileService", () => {
  test("sends and stores verification codes", async () => {
    const { redis, service } = createService();

    await expect(service.sendCode("13800000000", VerificationCodeUsage.Login)).resolves.toBe(true);
    expect(redis.__values.get("mobile-code:login:13800000000")).toBe("1234");
  });

  test("consumes matching verification code once", async () => {
    const { service } = createService();

    await service.sendCode("13800000000", VerificationCodeUsage.Login);
    await expect(service.consumeVerificationCode(VerificationCodeUsage.Login, "13800000000", "1234")).resolves.toBe(true);
    await expect(service.consumeVerificationCode(VerificationCodeUsage.Login, "13800000000", "1234")).resolves.toBe(false);
  });
});
