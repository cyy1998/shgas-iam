import type { ClockPort, RandomPort, RedisPort } from "@api/composition/runtime";

export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 30 * 60;

const LOGIN_FAILURE_WINDOW_MS = LOGIN_FAILURE_WINDOW_SECONDS * 1000;

export type LoginBlacklistReason = "password" | "mobile";

export type LoginFailureResult = {
  failureCount: number;
  remainingAttempts: number;
  shouldBlacklist: boolean;
};

export interface LoginFailureServiceDeps {
  redis: Pick<RedisPort, "multi" | "del" | "set" | "exists" | "get" | "ttl">;
  clock: Pick<ClockPort, "now">;
  random: Pick<RandomPort, "uuid">;
}

function loginFailureKey(userId: number) {
  return `login-failures:user:${userId}`;
}

function loginBlacklistKey(userId: number) {
  return `login-blacklist:user:${userId}`;
}

function getPipelineValue<T>(results: Array<[Error | null, unknown]> | null, index: number): T {
  const result = results?.[index];
  if (!result) {
    throw new Error("Redis login failure pipeline returned incomplete results");
  }
  const [error, value] = result;
  if (error) {
    throw error;
  }
  return value as T;
}

export function formatLoginFailureMessage(prefix: string, result: LoginFailureResult) {
  const suffix = `当前已连续失败 ${result.failureCount} 次，距离临时限制还有 ${result.remainingAttempts} 次`;
  return `${prefix}，${suffix}`;
}

export function createLoginFailureService(deps: LoginFailureServiceDeps) {
  async function recordLoginFailure(userId: number, now = deps.clock.now()): Promise<LoginFailureResult> {
    const key = loginFailureKey(userId);
    const windowStart = now - LOGIN_FAILURE_WINDOW_MS;
    const member = `${now}:${deps.random.uuid()}`;

    const results = await deps.redis
      .multi()
      .zremrangebyscore(key, "-inf", windowStart)
      .zadd(key, now, member)
      .zcard(key)
      .expire(key, LOGIN_FAILURE_WINDOW_SECONDS)
      .exec();

    const failureCount = getPipelineValue<number>(results, 2);
    const remainingAttempts = Math.max(LOGIN_FAILURE_THRESHOLD - failureCount, 0);

    return {
      failureCount,
      remainingAttempts,
      shouldBlacklist: failureCount >= LOGIN_FAILURE_THRESHOLD,
    };
  }

  async function clearLoginFailures(userId: number) {
    await deps.redis.del(loginFailureKey(userId));
  }

  async function blacklistLoginUser(userId: number, reason: LoginBlacklistReason) {
    await deps.redis.set(loginBlacklistKey(userId), reason, "EX", LOGIN_FAILURE_WINDOW_SECONDS);
  }

  async function isLoginUserBlacklisted(userId: number) {
    return (await deps.redis.exists(loginBlacklistKey(userId))) > 0;
  }

  async function getLoginBlacklistReason(userId: number): Promise<LoginBlacklistReason | null> {
    const reason = await deps.redis.get(loginBlacklistKey(userId));
    if (reason === "password" || reason === "mobile") {
      return reason;
    }
    return null;
  }

  async function clearLoginBlacklist(userId: number) {
    await deps.redis.del(loginBlacklistKey(userId));
  }

  async function getLoginBlacklistRemainingMinutes(userId: number) {
    const ttl = await deps.redis.ttl(loginBlacklistKey(userId));
    if (ttl <= 0) {
      return LOGIN_FAILURE_WINDOW_SECONDS / 60;
    }
    return Math.max(1, Math.ceil(ttl / 60));
  }

  async function formatLoginBlacklistMessage(userId: number) {
    const remainingMinutes = await getLoginBlacklistRemainingMinutes(userId);
    const reason = await getLoginBlacklistReason(userId);
    const reasonText = reason === "password"
      ? "密码错误达到 5 次"
      : reason === "mobile"
        ? "手机验证码错误达到 5 次"
        : "登录失败达到 5 次";
    return `账号已被临时限制，原因：${reasonText}，距离解封还有 ${remainingMinutes} 分钟，请稍后再试`;
  }

  return {
    formatLoginFailureMessage,
    recordLoginFailure,
    clearLoginFailures,
    blacklistLoginUser,
    isLoginUserBlacklisted,
    getLoginBlacklistReason,
    clearLoginBlacklist,
    getLoginBlacklistRemainingMinutes,
    formatLoginBlacklistMessage,
  };
}

export type LoginFailureService = ReturnType<typeof createLoginFailureService>;
