
import Redis from 'ioredis'
import { env } from '../../config'

let redisClient: Redis | null = null

function createRedisClient() {
    if (!redisClient) {
        redisClient = new Redis({
            host: env.REDIS_URL,
            port: env.REDIS_PORT,
            db: env.REDIS_DB
        })
    }
    return redisClient
}

export const redis = createRedisClient()