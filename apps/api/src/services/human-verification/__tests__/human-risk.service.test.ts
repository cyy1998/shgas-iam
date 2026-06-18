import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { createMemoryRedis } from "@api/test/fakes";
import { describe, expect, test } from "bun:test";
import { createHumanRiskService } from "../human-risk.service";

function createService() {
  return createHumanRiskService({
    redis: createMemoryRedis() as any,
    config: {
      capEnabled: true,
      windowSeconds: 60,
      loginFailureThreshold: 2,
      lookupThreshold: 2,
    },
  });
}

describe("createHumanRiskService", () => {
  test("requires verification for SMS code send", async () => {
    const service = createService();

    await expect(service.shouldRequireVerification(
      HumanVerificationAction.SendSmsCode,
      { ip: "127.0.0.1", subject: "13800000000" },
    )).resolves.toBe(true);
  });

  test("tracks login failures by subject and ip", async () => {
    const service = createService();
    const context = { ip: "127.0.0.1", subject: "zhangsan" };

    await service.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
    await expect(service.shouldRequireVerification(
      HumanVerificationAction.PasswordLogin,
      context,
    )).resolves.toBe(false);
    await service.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
    await expect(service.shouldRequireVerification(
      HumanVerificationAction.PasswordLogin,
      context,
    )).resolves.toBe(true);
  });
});
