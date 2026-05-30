import { beforeEach, describe, expect, mock, test } from "bun:test";

class FakeRedis {
  readonly values = new Map<string, string>();

  reset() {
    this.values.clear();
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
    return "OK";
  }

  async eval(_script: string, _numkeys: number, key: string, code: string) {
    const savedCode = this.values.get(key);
    if (savedCode !== code) {
      return 0;
    }
    this.values.delete(key);
    return 1;
  }
}

const fakeRedis = new FakeRedis();

mock.module("@api/lib/infra/redis", () => ({
  default: fakeRedis,
}));

mock.module("@api/lib/integrations/sms", () => ({
  default: {
    sendMessage: mock(async () => true),
    sendVerificationCode: mock(async () => ({ success: true, code: "123456" })),
  },
}));

mock.module("@iam/db", () => ({
  default: {},
}));

const mobileService = await import("../mobile.service");

beforeEach(() => {
  fakeRedis.reset();
});

describe("mobile verification code service", () => {
  test("checks verification codes without consuming them", async () => {
    await fakeRedis.set("mobile-code:resetPassword:17721462865", "123456");

    await expect(
      mobileService.checkVerificationCode("resetPassword", "17721462865", "123456"),
    ).resolves.toBe(true);
    await expect(fakeRedis.get("mobile-code:resetPassword:17721462865")).resolves.toBe("123456");
  });

  test("consumes a matching verification code once", async () => {
    await fakeRedis.set("mobile-code:login:17721462865", "123456");

    await expect(
      mobileService.consumeVerificationCode("login", "17721462865", "123456"),
    ).resolves.toBe(true);
    await expect(
      mobileService.consumeVerificationCode("login", "17721462865", "123456"),
    ).resolves.toBe(false);
  });

  test("does not consume a verification code when the submitted code is wrong", async () => {
    await fakeRedis.set("mobile-code:bindPhone:17721462865", "123456");

    await expect(
      mobileService.consumeVerificationCode("bindPhone", "17721462865", "000000"),
    ).resolves.toBe(false);
    await expect(fakeRedis.get("mobile-code:bindPhone:17721462865")).resolves.toBe("123456");
  });
});
