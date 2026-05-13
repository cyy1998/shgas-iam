import type { UserDetailDto } from "../user/user.type";
import type { LocalSessionAbstract } from "./session.type";
import { ClientManagementLevel } from "@api/enums/client.managementLevel";
import config from "@api/env";
import redis from "@api/lib/clients/redis";
import * as clientService from "@api/services/client/client.service";
import * as sessionRepository from "@api/services/session/session.repository";
import { reviveIsoDates } from "@iam/api-core/utils";
import { LocalSessionAbstractSchema } from "./session.schema";

export async function updateSession(sessionId: string, userInfo: string) {
  await redis.set(`global_session:${sessionId}`, userInfo, "EX", config.REDIS_EXPIRE_TIME);
  return true;
}

export async function setLocalSession(
  globalSessionId: string,
  clientCode: string,
  userDetailDto: UserDetailDto,
  mode: ClientManagementLevel,
) {
  const ttl = await redis.ttl(`global_session:${globalSessionId}`);
  const localSessionId = crypto.randomUUID();
  await Promise.all([
    redis.set(`local_${clientCode}_session:${localSessionId}`, JSON.stringify(userDetailDto), "EX", ttl),
    redis.set(`local_session_reverse:${localSessionId}`, globalSessionId, "EX", ttl),
    redis.zadd(`local_session_set:${globalSessionId}`, Date.now() + ttl * 1000, JSON.stringify({ clientCode, localSessionId, mode })),
    redis.expire(`local_session_set:${globalSessionId}`, config.REDIS_EXPIRE_TIME),
    sessionRepository.loginLog(userDetailDto, clientCode, "局部系统登录"),
  ]);
  return { localSessionId, ttl };
}

export async function removeLocalSession(localSessionAbstract: LocalSessionAbstract) {
  await Promise.all([
    redis.del(`local_${localSessionAbstract.clientCode}_session:${localSessionAbstract.localSessionId}`),
    redis.del(`local_session_reverse:${localSessionAbstract.localSessionId}`),
  ]);
  if (localSessionAbstract.mode === ClientManagementLevel.Independent) {
    const client = await clientService.getClientByCode(localSessionAbstract.clientCode);
    if (!client) {
      return;
    }
    await fetch(client.extAttributes.logoutEndpoint, {
      method: "POST",
      body: JSON.stringify({
        sid: localSessionAbstract.localSessionId,
      }),
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
    });
  }
}

export async function getGlobalSessionIdByLocalSession(localSessionId: string) {
  const globalSessionId = await redis.get(`local_session_reverse:${localSessionId}`);
  return globalSessionId;
}

export async function getValidLocalSessions(globalSessionId: string) {
  const now = Date.now();
  // 移除所有 score <= now 的过期元素（可选）
  await redis.zremrangebyscore(`local_session_set:${globalSessionId}`, "-inf", now);
  // 返回剩余（未过期）的元素
  return (await redis.zrange(`local_session_set:${globalSessionId}`, 0, -1)).map(e => LocalSessionAbstractSchema.parse(JSON.parse(e, reviveIsoDates)));
}
export async function setGlobalSession(user: UserDetailDto) {
  const sessionId = crypto.randomUUID();
  await Promise.all([
    redis.set(`global_session:${sessionId}`, JSON.stringify(user), "EX", config.REDIS_EXPIRE_TIME),
  ]);

  return sessionId;
}

export async function removeGlobalSession(globalSessionId: string) {
  await Promise.all([
    redis.del(`global_session:${globalSessionId}`),
    redis.del(`local_session_set:${globalSessionId}`),
  ]);
}

export async function checkVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
  const savedCode = await redis.get(`mobile-code:${usage}:${phone}`);
  return savedCode === code;
}
