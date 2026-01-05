
import Redis from 'ioredis'
import { env } from '../../config'

export const redis = new Redis({
    host: env.REDIS_URL,
    port: env.REDIS_PORT,
    db: env.REDIS_DB
    // 或使用连接字符串: redis://:password@host:port
})