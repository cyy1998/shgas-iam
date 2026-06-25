import env from "@admin-api/env";
import { createRedisClient } from "@iam/api-core/redis";

const redis = createRedisClient({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
});

export default redis;
