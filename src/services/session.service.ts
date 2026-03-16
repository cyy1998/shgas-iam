import type { UserDetailDto } from '@schemas/user.common.type';
import { AuthzUnauthorizedError } from '@errors/AuthzUnauthorizedError';
import { UserDetailDtoSchema } from '@schemas/user.common.type';
import config from '@/env';
import redis from '@/lib/clients/redis';

export async function getSessionById(sessionId: string): Promise<UserDetailDto> {
  const session = await redis.get(`global_session:${sessionId}`);
  if (session === null) {
    throw new AuthzUnauthorizedError('未登录');
  }
  return UserDetailDtoSchema.parse(JSON.parse(session));
}

export async function updateSession(sessionId: string, userInfo: string) {
  await redis.set(`global_session:${sessionId}`, userInfo, 'EX', config.REDIS_EXPIRE_TIME);
  return true;
}

// export async function setLocalSession(key: string, item: string, ttlSeconds: number) {
//   const expireAt = Date.now() + ttlSeconds * 1000; // 毫秒时间戳
//   await redis.zadd(key, expireAt, item);
//   return true;
// }

export async function setLocalSession(globalSessionId: string, clientCode: string, userDetailDto: UserDetailDto) {
  const ttl = await redis.ttl(`global_session:${globalSessionId}`);
  const localSessionId = crypto.randomUUID();
  await Promise.all([
    redis.set(`local_${clientCode}_session:${localSessionId}`, JSON.stringify(userDetailDto), 'EX', ttl),
    redis.set(`local_session_reverse:${localSessionId}`, globalSessionId, 'EX', ttl),
    redis.zadd(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${localSessionId}`, Date.now() + ttl * 1000),
    redis.expire(`local_session_set:${globalSessionId}`, config.REDIS_EXPIRE_TIME),
  ]);
  return { localSessionId, ttl };
}

export async function getGlobalSessionIdByLocalSession(localSessionId: string) {
  const globalSessionId = await redis.get(`local_session_reverse:${localSessionId}`);
  return globalSessionId;
}

export async function getValidLocalSessions(key: string) {
  const now = Date.now();
  // 移除所有 score <= now 的过期元素（可选）
  await redis.zremrangebyscore(key, '-inf', now);
  // 返回剩余（未过期）的元素
  return await redis.zrange(key, 0, -1);
}
export async function setGlobalSession(user: UserDetailDto) {
  const sessionId = crypto.randomUUID();
  await redis.set(`global_session:${sessionId}`, JSON.stringify(user), 'EX', config.REDIS_EXPIRE_TIME);
  return sessionId;
}
export async function cehckVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
  const savedCode = await redis.get(`mobile-code:${usage}:${phone}`);
  return savedCode === code;
}
