import env from "@api/env";
import { createRedisClient } from "@iam/api-core/redis";

const redis = createRedisClient(env.redis);

export default redis;
