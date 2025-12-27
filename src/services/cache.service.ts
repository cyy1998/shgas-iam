import { env } from "../config"
import { AuthzError } from "../errors/AuthzError"
import { redis } from "../libs/cache/redis"

export const cacheService = {
    async getSessionById(sessionId: string) {
        const session = await redis.get(`session:${sessionId}`)
        if (session === null) {
            throw new AuthzError('未登录')
        }
        return JSON.parse(session)
    },

    async updateSession(sessionId: string, userInfo: string) {
        await redis.set(`session:${sessionId}`, userInfo, 'EX', env.REDIS_EXPIRE_TIME)
        return true
    },
}