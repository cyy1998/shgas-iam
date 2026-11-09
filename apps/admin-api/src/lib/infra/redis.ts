import env from "@admin-api/env";
import { createRedisClient } from "@iam/runtime/redis/connection";

const redis = createRedisClient(env.redis);

export default redis;
