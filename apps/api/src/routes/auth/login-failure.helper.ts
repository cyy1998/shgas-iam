import redis from "@api/lib/infra/redis";

export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 30 * 60;

const LOGIN_FAILURE_WINDOW_MS = LOGIN_FAILURE_WINDOW_SECONDS * 1000;

export type LoginFailureResult = {
  failureCount: number;
  remainingAttempts: number;
  shouldSuspend: boolean;
};

function loginFailureKey(userId: number) {
  return `login-failures:user:${userId}`;
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
  const suffix = `当前已连续失败 ${result.failureCount} 次，距离账号暂停还有 ${result.remainingAttempts} 次`;
  return result.shouldSuspend
    ? `${prefix}，${suffix}，账号已暂停`
    : `${prefix}，${suffix}`;
}

export async function recordLoginFailure(userId: number, now = Date.now()): Promise<LoginFailureResult> {
  const key = loginFailureKey(userId);
  const windowStart = now - LOGIN_FAILURE_WINDOW_MS;
  const member = `${now}:${crypto.randomUUID()}`;

  const results = await redis
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
    shouldSuspend: failureCount >= LOGIN_FAILURE_THRESHOLD,
  };
}

export async function clearLoginFailures(userId: number) {
  await redis.del(loginFailureKey(userId));
}
