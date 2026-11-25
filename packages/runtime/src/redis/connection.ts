import { createHash } from "node:crypto";
import Redis from "ioredis";
import type { RedisConfig } from "./config";
import { createSingleton } from "./singleton";

export function createOwnedRedisClient(config: RedisConfig) {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    username: config.username,
    db: config.db,
    // Keep HTTP failures bounded by the established retry budget, independent of ioredis defaults.
    maxRetriesPerRequest: 20,
    retryStrategy: (times) => Math.min(times * 50, 2_000),
  });
}

export function createRedisClient(config: RedisConfig) {
  const identity = createHash("sha256")
    .update(JSON.stringify([config.host, config.port, config.db, config.username ?? null, config.password ?? null]))
    .digest("hex");
  return createSingleton<Redis>(`redis:${identity}`, () => createOwnedRedisClient(config), {
    destroy: async (client) => void (await client.quit()),
  });
}
