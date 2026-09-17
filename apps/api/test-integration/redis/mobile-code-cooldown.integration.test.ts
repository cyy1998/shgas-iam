import { randomUUID } from "node:crypto";
import process from "node:process";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { ApiErrorCode } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import Redis from "ioredis";

async function fixture() {
  const url = process.env.IAM_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  const keyPrefix = `sms-cooldown-test:${randomUUID()}:`;
  const clients = [0, 1].map(() => new Redis(url, { keyPrefix, lazyConnect: true, maxRetriesPerRequest: 0 }));
  try {
    await Promise.all(clients.map(client => client.connect()));
  }
  catch (error) {
    clients.forEach(client => client.disconnect());
    throw error;
  }
  const sender = mock(async (_phone: string) => ({ success: true, code: "1234" }));
  const services = clients.map(redis => createMobileService({
    redis,
    cooldown: createMobileCodeCooldown(redis),
    smsSender: { sendVerificationCode: sender, sendMessage: async () => true },
    userRepository: { getUserByMobile: async () => ({ id: 1 }) },
    config: { verificationCodeTtlSeconds: 180 },
  }));
  return {
    clients,
    services,
    sender,
    async close() {
      try {
        const keys = await clients[0]!.keys(`${keyPrefix}*`);
        if (keys.length)
          await clients[0]!.del(...keys.map(key => key.slice(keyPrefix.length)));
      }
      finally {
        clients.forEach(client => client.disconnect());
      }
    },
  };
}

test("concurrent service instances share one send across purposes and whitespace variants", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      f.services[i % 2]!.sendCode(i % 2 ? " 13800000000 " : "13800000000", i % 2 ? "bindPhone" : "login")));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: ApiErrorCode.SmsCooldown, httpStatus: 429, retryAfterSeconds: 60 });
    }
    expect(f.sender).toHaveBeenCalledTimes(1);
    await f.services[0]!.sendCode("13900000000", "login");
    expect(f.sender).toHaveBeenCalledTimes(2);
  }
  finally {
    await f.close();
  }
});

test("rejected sends preserve the code and consuming it does not release cooldown", async () => {
  const f = await fixture();
  try {
    const service = f.services[0]!;
    await service.sendCode("13800000000", VerificationCodeUsage.Login);
    const rejected = await Promise.allSettled([service.sendCode("13800000000", "login")]);
    expect(rejected[0]!.status).toBe("rejected");
    const valid = await service.checkVerificationCode("login", "13800000000", "1234");
    expect(valid).toBe(true);
    const consumed = await service.consumeVerificationCode("login", "13800000000", "1234");
    expect(consumed).toBe(true);
    const afterConsume = await Promise.allSettled([f.services[1]!.sendCode("13800000000", "bindPhone")]);
    expect(afterConsume[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    expect(f.sender).toHaveBeenCalledTimes(1);
  }
  finally {
    await f.close();
  }
});

test("provider failures retain a real shared cooldown", async () => {
  const f = await fixture();
  try {
    f.sender.mockRejectedValueOnce(new Error("network unavailable"));
    const failure = await Promise.allSettled([f.services[0]!.sendCode("13800000000", "login")]);
    expect(failure[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsSendFailed, retryAfterSeconds: 60 } });
    const retry = await Promise.allSettled([f.services[1]!.sendCode("13800000000", "resetPassword")]);
    expect(retry[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    expect(f.sender).toHaveBeenCalledTimes(1);
  }
  finally {
    await f.close();
  }
});

test("disconnected Redis refuses sending before the provider is called", async () => {
  const f = await fixture();
  try {
    f.clients[1]!.disconnect();
    const result = await Promise.allSettled([f.services[1]!.sendCode("13800000000", "login")]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsUnavailable, httpStatus: 503 } });
    expect(f.sender).not.toHaveBeenCalled();
  }
  finally {
    await f.close();
  }
});

test("a rejected retry does not slide the real 60 second expiry", async () => {
  const f = await fixture();
  try {
    await f.services[0]!.sendCode("13800000000", "login");
    await Bun.sleep(1100);
    const result = await Promise.allSettled([f.services[1]!.sendCode("13800000000", "login")]);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    if (result[0]?.status === "rejected") {
      expect(result[0].reason.retryAfterSeconds).toBeGreaterThan(0);
      expect(result[0].reason.retryAfterSeconds).toBeLessThanOrEqual(59);
    }
    await Bun.sleep(59_000);
    const sent = await f.services[1]!.sendCode("13800000000", "login");
    expect(sent).toBe(true);
    expect(f.sender).toHaveBeenCalledTimes(2);
  }
  finally {
    await f.close();
  }
}, 65_000);
