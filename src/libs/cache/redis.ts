
import Redis from 'ioredis'
import { config } from '../../config'

let redisClient: Redis | null = null

function createRedisClient() {
    if (!redisClient) {
        redisClient = new Redis({
            host: config.REDIS_URL,
            port: config.REDIS_PORT,
            db: config.REDIS_DB
        })
    }
    return redisClient
}

export const redis = createRedisClient()