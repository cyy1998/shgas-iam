import { env } from "../config"
import { AuthzError } from "../errors/AuthzError"
import { redis } from "../libs/cache/redis"
import type { UserDetailDto } from "../types/user.type"

export const cacheService = {
    async getSessionById(sessionId: string): Promise<UserDetailDto> {
        const session = await redis.get(`session:${sessionId}`)
        if (session === null) {
            throw new AuthzError('未登录')
        }
        return JSON.parse(session) as UserDetailDto
    },

    async updateSession(sessionId: string, userInfo: string) {
        await redis.set(`session:${sessionId}`, userInfo, 'EX', env.REDIS_EXPIRE_TIME)
        return true
    },
}