import { beforeEach, describe, expect, mock, test } from "bun:test";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown;

class FakeRedis {
  private readonly values = new Map<string, number>();
  private readonly sets = new Map<string, Set<string>>();

  reset() {
    this.values.clear();
    this.sets.clear();
  }

  async get(key: string) {
    const value = this.values.get(key);
    return value === undefined ? null : String(value);
  }

  async scard(key: string) {
    return this.sets.get(key)?.size ?? 0;
  }

  multi() {
    const operations: RedisOperation[] = [];
    const values = this.values;
    const sets = this.sets;

    const pipeline = {
      incr(key: string) {
        operations.push(() => {
          const next = (values.get(key) ?? 0) + 1;
          values.set(key, next);
          return next;
        });
        return pipeline;
      },
      sadd(key: string, value: string) {
        operations.push(() => {
          const set = sets.get(key) ?? new Set<string>();
          const before = set.size;
          set.add(value);
          sets.set(key, set);
          return set.size - before;
        });
        return pipeline;
      },
      expire() {
        operations.push(() => 1);
        return pipeline;
      },
      async exec(): Promise<RedisResult[]> {
        return operations.map(operation => [null, operation()]);
      },
    };

    return pipeline;
  }
}

const config = {
  CAP_ENABLED: true,
  HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD: 3,
  HUMAN_VERIFICATION_LOOKUP_THRESHOLD: 2,
  HUMAN_VERIFICATION_WINDOW_SECONDS: 600,
};

const fakeRedis = new FakeRedis();

mock.module("@api/env", () => ({ default: config }));
mock.module("@api/lib/infra/redis", () => ({ default: fakeRedis }));

const riskService = await import("../human-risk.service");
const { HumanVerificationAction } = await import("@api/enums/humanVerification.action");

beforeEach(() => {
  fakeRedis.reset();
  config.CAP_ENABLED = true;
});

describe("human verification risk service", () => {
  test("always requires verification for SMS code sending when enabled", async () => {
    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.SendSmsCode,
      { subject: "17721462865" },
    )).resolves.toBe(true);
  });

  test("requires verification after login failures reach the threshold", async () => {
    const context = {
      ip: "127.0.0.1",
      subject: "zhangsan",
    };

    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.PasswordLogin,
      context,
    )).resolves.toBe(false);

    await riskService.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
    await riskService.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.PasswordLogin,
      context,
    )).resolves.toBe(false);

    await riskService.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.PasswordLogin,
      context,
    )).resolves.toBe(true);
  });

  test("requires verification after querying too many distinct usernames", async () => {
    const context = { ip: "127.0.0.1" };

    await riskService.recordOpenUserInfoLookup("zhangsan", context);
    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.OpenUserInfoLookup,
      context,
    )).resolves.toBe(false);

    await riskService.recordOpenUserInfoLookup("lisi", context);
    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.OpenUserInfoLookup,
      context,
    )).resolves.toBe(true);
  });

  test("does not require verification when Cap is disabled", async () => {
    config.CAP_ENABLED = false;

    await expect(riskService.shouldRequireVerification(
      HumanVerificationAction.SendSmsCode,
      { subject: "17721462865" },
    )).resolves.toBe(false);
  });
});
