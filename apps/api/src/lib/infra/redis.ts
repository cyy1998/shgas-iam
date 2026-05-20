import env from "@api/env";
import { createRedisClient } from "@iam/api-core/redis";

const redis = createRedisClient({
  host: env.REDIS_URL,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
});

export default redis;
