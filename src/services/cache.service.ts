import { env } from "../config"
import { redis } from "../libs/cache/redis"

export const cacheService = {
    async updateSession(sessionId: string, userInfo: string) {
        await redis.set(`session:${sessionId}`, userInfo, 'EX', env.REDIS_EXPIRE_TIME)
        return true
    },
}