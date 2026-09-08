import Redis from "ioredis";

export function createMaintenanceRedis(options: { host: string; port: number; db: number; password?: string }) {
  const redis = new Redis({
    ...options,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 5000,
    commandTimeout: 5000,
  });
  // Avoid ioredis printing raw connection errors before the command's safe report.
  redis.on("error", () => {});
  return redis;
}
