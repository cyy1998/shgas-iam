import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { createFakeLogger, createMemoryRedis } from "@api/test/fakes";
import { describe, expect, mock, test } from "bun:test";
import { createCapService } from "../cap.service";

function createService() {
  const redis = createMemoryRedis();
  const capClient = {
    createChallenge: mock(async () => ({ challenge: { c: 1, s: 2, d: 3 }, expires: 10, token: "challenge" })),
    redeemChallenge: mock(async () => ({ success: true, token: "redeemed" })),
    validateToken: mock(async () => ({ success: true })),
  };
  const service = createCapService({
    capClient,
    redis: redis as any,
    logger: createFakeLogger() as any,
    riskService: { shouldRequireVerification: mock(async () => true) },
    config: {
      capEnabled: true,
      siteKey: "site",
      secret: "secret",
      challengeTtlMs: 60_000,
      tokenTtlSeconds: 60,
    },
  });
  return { capClient, redis, service };
}

describe("createCapService", () => {
  test("redeems challenge tokens for an action and verifies them once", async () => {
    const { capClient, service } = createService();

    await expect(service.redeemChallenge({
      token: "challenge",
      solutions: [1, 2],
    }, HumanVerificationAction.PasswordLogin)).resolves.toEqual({ success: true, token: "redeemed" });

    await service.verifyTokenForAction(HumanVerificationAction.PasswordLogin, "redeemed");
    expect(capClient.validateToken).toHaveBeenCalledWith("redeemed");
  });

  test("skips token validation when Cap is disabled", async () => {
    const { capClient } = createService();
    const disabled = createCapService({
      capClient,
      redis: createMemoryRedis() as any,
      logger: createFakeLogger() as any,
      riskService: { shouldRequireVerification: mock(async () => true) },
      config: {
        capEnabled: false,
        siteKey: "site",
        secret: "secret",
        challengeTtlMs: 60_000,
        tokenTtlSeconds: 60,
      },
    });

    await expect(disabled.verifyTokenForAction(HumanVerificationAction.PasswordLogin)).resolves.toBeUndefined();
  });
});
