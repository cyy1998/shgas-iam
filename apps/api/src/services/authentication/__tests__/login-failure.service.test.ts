import { createMemoryRedis } from "@api/testing/fakes";
import { expect, test } from "bun:test";
import {
  createLoginFailureService,
  LOGIN_FAILURE_WINDOW_SECONDS,
} from "../login-failure.service";

test("stores shared login failure and blacklist state with the existing Redis contract", async () => {
  let now = 1_800_000_000_000;
  let sequence = 0;
  const redis = createMemoryRedis(() => now);
  const service = createLoginFailureService({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    redis: redis as never,
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await expect(service.recordLoginFailure(1001)).resolves.toEqual({
      failureCount: attempt,
      remainingAttempts: 5 - attempt,
      shouldBlacklist: attempt === 5,
    });
    now += 1;
  }
  await service.blacklistLoginUser(1001, "mobile");

  expect(redis.__sortedSets.get("login-failures:user:1001")).toHaveLength(5);
  expect(await redis.ttl("login-failures:user:1001")).toBe(LOGIN_FAILURE_WINDOW_SECONDS);
  expect(await redis.get("login-blacklist:user:1001")).toBe("mobile");
  expect(await redis.ttl("login-blacklist:user:1001")).toBe(LOGIN_FAILURE_WINDOW_SECONDS);
  await expect(service.formatLoginBlacklistMessage(1001)).resolves.toBe(
    "账号已被临时限制，原因：手机验证码错误达到 5 次，距离解封还有 30 分钟，请稍后再试",
  );
});
