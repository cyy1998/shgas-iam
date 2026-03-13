import type { UserDetailDto } from '@schemas/user.common.type';
import { AuthzUnauthorizedError } from '@errors/AuthzUnauthorizedError';
import { UserDetailDtoSchema } from '@schemas/user.common.type';
import config from '@/env';
import redis from '@/lib/clients/redis';

export const sessionService = {
  async getSessionById(sessionId: string): Promise<UserDetailDto> {
    const session = await redis.get(`global_session:${sessionId}`);
    if (session === null) {
      throw new AuthzUnauthorizedError('未登录');
    }
    return UserDetailDtoSchema.parse(JSON.parse(session));
  },

  async updateSession(sessionId: string, userInfo: string) {
    await redis.set(`global_session:${sessionId}`, userInfo, 'EX', config.REDIS_EXPIRE_TIME);
    return true;
  },

  async setLocalSession(key: string, item: string, ttlSeconds: number) {
    const expireAt = Date.now() + ttlSeconds * 1000; // 毫秒时间戳
    await redis.zadd(key, expireAt, item);
    return true;
  },

  async getValidLocalSessions(key: string) {
    const now = Date.now();
    // 移除所有 score <= now 的过期元素（可选）
    await redis.zremrangebyscore(key, '-inf', now);
    // 返回剩余（未过期）的元素
    return await redis.zrange(key, 0, -1);
  },
  async setGlobalSession(user: UserDetailDto) {
    const sessionId = crypto.randomUUID();
    await redis.set(`global_session:${sessionId}`, JSON.stringify(user), 'EX', config.REDIS_EXPIRE_TIME);
    return sessionId;
  },
  async cehckVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    const savedCode = await redis.get(`mobile-code:${usage}:${phone}`);
    return savedCode === code;
  },
};
