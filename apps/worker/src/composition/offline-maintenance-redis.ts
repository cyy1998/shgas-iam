import type { OfflineMaintenanceEnv } from "@worker/env";
import Redis from "ioredis";

/** No runtime defaults, retry queue, PostgreSQL, consumer or HTTP server. */
export function createOfflineMaintenanceRedis(config: OfflineMaintenanceEnv, signal: AbortSignal) {
  const redis = new Redis({
    ...config,
    lazyConnect: true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on("error", () => {});
  const abort = () => redis.disconnect();
  signal.addEventListener("abort", abort, { once: true });
  return {
    redis,
    async connect() {
      signal.throwIfAborted();
      await redis.connect();
      signal.throwIfAborted();
    },
    close() {
      signal.removeEventListener("abort", abort);
      redis.disconnect();
    },
  };
}
