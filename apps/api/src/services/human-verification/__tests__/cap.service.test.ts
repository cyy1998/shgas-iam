import { ServiceStatusCode } from "@iam/contracts";
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

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }
}

const config = {
  CAP_CHALLENGE_TTL_MS: 600_000,
  CAP_ENABLED: true,
  CAP_SECRET: "test-secret",
  CAP_SITE_KEY: "iam-sso",
  CAP_TOKEN_TTL_SECONDS: 600,
};

const fakeRedis = new FakeRedis();
const validateCalls: string[] = [];
let validateSuccess = true;
let redeemSuccess = true;

class FakeCap {
  async createChallenge() {
    return {
      challenge: { c: 1, d: 2, s: 3 },
      token: "challenge-token",
      expires: Date.now() + 60_000,
    };
  }

  async redeemChallenge() {
    return redeemSuccess
      ? { success: true, token: "redeemed-token", expires: Date.now() + 60_000 }
      : { success: false, message: "bad solution" };
  }

  async validateToken(token: string) {
    validateCalls.push(token);
    return { success: validateSuccess };
  }
}

mock.module("@api/env", () => ({ default: config }));
mock.module("@api/lib/clients/redis", () => ({ default: fakeRedis }));
mock.module("@cap.js/server", () => ({ default: FakeCap }));

const capService = await import("../cap.service");

beforeEach(() => {
  fakeRedis.reset();
  validateCalls.length = 0;
  validateSuccess = true;
  redeemSuccess = true;
  config.CAP_ENABLED = true;
});

describe("human verification cap service", () => {
  test("validates and consumes a token bound to the requested action", async () => {
    await capService.redeemChallenge(
      { token: "challenge-token", solutions: [1] },
      capService.HumanVerificationAction.SendSmsCode,
    );

    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      "redeemed-token",
    )).resolves.toBeUndefined();

    expect(validateCalls).toEqual(["redeemed-token"]);
    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      "redeemed-token",
    )).rejects.toHaveProperty("code", ServiceStatusCode.HumanVerificationRequired);
  });

  test("rejects missing, invalid, consumed, expired, or action-mismatched tokens", async () => {
    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      undefined,
    )).rejects.toHaveProperty("code", ServiceStatusCode.HumanVerificationRequired);

    await capService.redeemChallenge(
      { token: "challenge-token", solutions: [1] },
      capService.HumanVerificationAction.PasswordLogin,
    );
    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      "redeemed-token",
    )).rejects.toHaveProperty("code", ServiceStatusCode.HumanVerificationRequired);

    await capService.redeemChallenge(
      { token: "challenge-token", solutions: [1] },
      capService.HumanVerificationAction.SendSmsCode,
    );
    validateSuccess = false;
    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      "redeemed-token",
    )).rejects.toHaveProperty("code", ServiceStatusCode.HumanVerificationRequired);
  });

  test("skips token validation when Cap is disabled", async () => {
    config.CAP_ENABLED = false;

    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      undefined,
    )).resolves.toBeUndefined();

    expect(validateCalls).toHaveLength(0);
  });

  test("does not store action context for failed or unknown-action redeems", async () => {
    redeemSuccess = false;
    await expect(capService.redeemChallenge(
      { token: "challenge-token", solutions: [1] },
      capService.HumanVerificationAction.SendSmsCode,
    )).resolves.toEqual({ success: false, message: "bad solution" });

    redeemSuccess = true;
    await capService.redeemChallenge({ token: "challenge-token", solutions: [1] }, "unknown");
    await expect(capService.verifyTokenForAction(
      capService.HumanVerificationAction.SendSmsCode,
      "redeemed-token",
    )).rejects.toHaveProperty("code", ServiceStatusCode.HumanVerificationRequired);
  });
});
