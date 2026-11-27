import Redis from "ioredis";

export function formatRedisSlotUrl(rawUrl, slot) {
  const url = URL.parse(rawUrl);
  if (url?.protocol !== "redis:" || !url.hostname || /[?#]/u.test(rawUrl) || !/^\/?\d*$/u.test(url.pathname))
    throw new Error("IAM_TEST_REDIS_URL must be a redis:// URL with an optional database number");
  url.pathname = `/${slot}`;
  return url.href;
}

export async function verifyRedisDatabaseSlotSupport(rawUrl) {
  const redis = new Redis(formatRedisSlotUrl(rawUrl, 0), {
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
    await redis.select(31);
  } finally {
    redis.disconnect();
  }
}
