import type { OidcProviderEnv } from "../env.ts";
import { createRedisClient } from "@iam/api-core/redis";

export function createProviderRedis(env: OidcProviderEnv) {
  return createRedisClient({
    host: env.REDIS_URL,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  });
}
