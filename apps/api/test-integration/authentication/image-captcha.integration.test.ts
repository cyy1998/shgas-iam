import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createImageCaptchaService } from "@api/services/human-verification/image-captcha.service";
import { ApiErrorCode } from "@iam/contracts";
import Redis from "ioredis";
import { cleanupAfterFixtureFailure } from "../oidc/oidc.fixture";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";

afterEach(resetApiRedisTestDatabase);

async function fixture() {
  const url = process.env.IAM_API_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const redis = new Redis(url, {
    keyPrefix: `image-captcha-test:${randomUUID()}:`,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
  });
  const close = ownApiTestExecutor(() => closeApiRedisConnection(redis));
  try {
    await redis.connect();
  } catch (error) {
    return await cleanupAfterFixtureFailure(error, close);
  }

  const service = createImageCaptchaService({
    redis,
    enabled: true,
    secret: "test-image-captcha-secret",
    clock: { now: Date.now },
    render: () => ({ answer: "AC9TV3", imageBase64: "test-image" }),
  });
  return { service, close };
}

test("allows further answers on the same image while limiting submit frequency", async () => {
  const { service, close } = await fixture();
  try {
    const action = HumanVerificationAction.PasswordLogin;
    const context = { subject: "user" };
    const ticket = service.issueTicket(action, context);
    if (!ticket) throw new Error("Expected image CAPTCHA ticket");
    const { challengeId } = await service.createChallenge(ticket);
    for (let i = 0; i < 4; i++) {
      const incorrect = await service.verifyAnswer(ticket, challengeId, "WRONG");
      expect(incorrect).toEqual({ result: "incorrect" });
      if (i === 0) {
        const tooSoon = await Promise.allSettled([service.verifyAnswer(ticket, challengeId, "WRONG")]);
        expect(tooSoon[0]).toMatchObject({
          status: "rejected",
          reason: { code: ApiErrorCode.ImageCaptchaCooldown, retryAfterSeconds: 1 },
        });
      }
      await Bun.sleep(1050);
    }
    const verified = await service.verifyAnswer(ticket, challengeId, "ac9tv3");
    expect(verified.result).toBe("verified");
    if (verified.result !== "verified") throw new Error("Expected an image CAPTCHA proof");
    const scopedContext = { ...context, imageCaptchaProof: verified.proof };
    const results = await Promise.all([
      service.verifyProof(action, scopedContext),
      service.verifyProof(action, scopedContext),
    ]);
    expect(results).toContain(true);
    expect(results).toContain(false);
  } finally {
    await close();
  }
}, 10_000);

test("refreshes the image and binds the proof to its operation, target and SMS usage", async () => {
  const { service, close } = await fixture();
  try {
    const action = HumanVerificationAction.SendSmsCode;
    const phoneNumber = "13800000000";
    const context = { subject: phoneNumber, sms: { usage: VerificationCodeUsage.Login, phoneNumber } };
    const ticket = service.issueTicket(action, context);
    if (!ticket) throw new Error("Expected image CAPTCHA ticket");
    const first = await service.createChallenge(ticket);
    const second = await service.createChallenge(ticket);
    const expired = await service.verifyAnswer(ticket, first.challengeId, "AC9TV3");
    expect(expired).toEqual({ result: "expired" });
    await Bun.sleep(1050);
    const verified = await service.verifyAnswer(ticket, second.challengeId, "AC9TV3");
    if (verified.result !== "verified") throw new Error("Expected an image CAPTCHA proof");

    const original = { ...context, imageCaptchaProof: verified.proof };
    const differentOperation = await service.verifyProof(HumanVerificationAction.MobileLogin, original);
    expect(differentOperation).toBe(false);
    const differentTarget = await service.verifyProof(action, { ...original, subject: "13900000000" });
    expect(differentTarget).toBe(false);
    const differentUsage = await service.verifyProof(action, {
      ...original,
      sms: { ...context.sms, usage: VerificationCodeUsage.BindPhone },
    });
    expect(differentUsage).toBe(false);
    const consumed = await service.verifyProof(action, original);
    expect(consumed).toBe(true);
  } finally {
    await close();
  }
});

test("shares the issue rate limit across new tickets and refreshes for the same operation", async () => {
  const { service, close } = await fixture();
  try {
    const action = HumanVerificationAction.OpenUserInfoLookup;
    const context = { subject: "user" };
    const firstTicket = service.issueTicket(action, context);
    const secondTicket = service.issueTicket(action, context);
    if (!firstTicket || !secondTicket) throw new Error("Expected image CAPTCHA tickets");
    for (let i = 0; i < 10; i++) {
      await service.createChallenge(firstTicket, "192.0.2.1");
    }
    const limited = await Promise.allSettled([service.createChallenge(secondTicket, "192.0.2.2")]);
    expect(limited[0]).toMatchObject({
      status: "rejected",
      reason: { code: ApiErrorCode.ImageCaptchaCooldown, httpStatus: 429 },
    });
  } finally {
    await close();
  }
});
