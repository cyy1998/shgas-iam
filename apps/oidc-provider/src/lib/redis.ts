import type { OidcProviderEnv } from "../env.ts";
import { createRedisClient } from "@iam/api-core/redis";

export function createProviderRedis(env: OidcProviderEnv) {
  return createRedisClient({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    db: env.redis.db,
  });
}
