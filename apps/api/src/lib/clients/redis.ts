import config from "@api/env";
import Redis from "ioredis";
import { createSingleton } from "../core/singleton";

function createRedisClient() {
  return new Redis({
    host: config.REDIS_URL,
    port: config.REDIS_PORT,
    db: config.REDIS_DB,
  });
}

const redisClient = createSingleton<Redis>(
  "redis",
  createRedisClient,
  { destroy: async client => void await client.quit() },
);

export default redisClient;
