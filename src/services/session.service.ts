import { env } from "../config"
import { AuthzError } from "../errors/AuthzError"
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError"
import { redis } from "../libs/cache/redis"
import type { UserDetailDto } from "../types/user.common.type"

export const sessionService = {
    async getSessionById(sessionId: string): Promise<UserDetailDto> {
        const session = await redis.get(`global_session:${sessionId}`)
        if (session === null) {
            throw new AuthzUnauthorizedError('未登录')
        }
        return JSON.parse(session) as UserDetailDto
    },

    async updateSession(sessionId: string, userInfo: string) {
        await redis.set(`global_session:${sessionId}`, userInfo, 'EX', env.REDIS_EXPIRE_TIME)
        return true
    },

    async setLocalSession(key: string, item: string, ttlSeconds: number) {
        const expireAt = Date.now() + ttlSeconds * 100; // 毫秒时间戳
        await redis.zadd(key, expireAt, item);
    },

    async getValidLocalSessions(key: string) {
        const now = Date.now();
        // 移除所有 score <= now 的过期元素（可选）
        await redis.zremrangebyscore(key, '-inf', now);
        // 返回剩余（未过期）的元素
        return await redis.zrange(key, 0, -1);
    }
}