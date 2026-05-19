import redis from "@api/lib/clients/redis";

export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 30 * 60;

const LOGIN_FAILURE_WINDOW_MS = LOGIN_FAILURE_WINDOW_SECONDS * 1000;

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

export async function recordLoginFailure(userId: number, now = Date.now()) {
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

  return getPipelineValue<number>(results, 2);
}

export async function clearLoginFailures(userId: number) {
  await redis.del(loginFailureKey(userId));
}
