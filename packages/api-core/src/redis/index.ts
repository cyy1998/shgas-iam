import Redis from "ioredis";
import { createSingleton } from "../core/singleton";

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
};

export function createRedisClient(config: RedisConfig) {
  return createSingleton<Redis>(
    `redis:${config.host}:${config.port}:${config.db}`,
    () => new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      // Keep HTTP failures bounded by the established retry budget, independent of ioredis defaults.
      maxRetriesPerRequest: 20,
      retryStrategy: times => Math.min(times * 50, 2_000),
    }),
    { destroy: async client => void await client.quit() },
  );
}
