import type { UserDetailDto } from "../user/user.type";
import type { LocalSessionAbstract } from "./session.type";
import config from "@api/env";
import redis from "@api/lib/infra/redis";
import { logger } from "@api/lib/logger";
import * as authAudit from "@api/services/audit/events/auth.audit";
import * as clientService from "@api/services/client/client.service";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { reviveIsoDates } from "@iam/api-core/utils";
import { ClientManagementLevel } from "@iam/contracts";
import { LocalSessionAbstractSchema } from "./session.schema";

const globalSessionKey = (sessionId: string) => `global_session:${sessionId}`;
const localSessionKey = (clientCode: string, localSessionId: string) => `local_${clientCode}_session:${localSessionId}`;
const localSessionReverseKey = (localSessionId: string) => `local_session_reverse:${localSessionId}`;
const localSessionSetKey = (globalSessionId: string) => `local_session_set:${globalSessionId}`;

function localSessionMember(localSessionAbstract: LocalSessionAbstract) {
  return JSON.stringify(localSessionAbstract);
}

async function getActiveGlobalSessionTtl(globalSessionId: string) {
  const ttl = await redis.ttl(globalSessionKey(globalSessionId));
  if (ttl <= 0) {
    throw new AuthzUnauthorizedError("全局session不存在或已过期");
  }
  return ttl;
}

async function bestEffortDelete(keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    try {
      await redis.del(key);
    }
    catch (error) {
      logger.warn({ err: error, key }, "failed to clean stale session key");
    }
  }));
}

export async function updateSession(sessionId: string, userInfo: string) {
  await redis.set(globalSessionKey(sessionId), userInfo, "EX", config.REDIS_EXPIRE_TIME);
  return true;
}

export async function setLocalSession(
  globalSessionId: string,
  clientCode: string,
  userDetailDto: UserDetailDto,
  mode: ClientManagementLevel,
) {
  const ttl = await getActiveGlobalSessionTtl(globalSessionId);
  const localSessionId = crypto.randomUUID();
  const localSessionAbstract = { clientCode, localSessionId, mode };
  const localKey = localSessionKey(clientCode, localSessionId);
  const reverseKey = localSessionReverseKey(localSessionId);
  const setKey = localSessionSetKey(globalSessionId);
  const result = await redis.multi()
    .set(localKey, JSON.stringify(userDetailDto), "EX", ttl)
    .set(reverseKey, globalSessionId, "EX", ttl)
    .zadd(setKey, Date.now() + ttl * 1000, localSessionMember(localSessionAbstract))
    .expire(setKey, ttl)
    .exec();

  if (!result) {
    throw new AuthzUnauthorizedError("局部session创建失败");
  }
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0]) {
    await bestEffortDelete([localKey, reverseKey]);
    throw failed[0];
  }

  await authAudit.recordLocalLoginSuccess(userDetailDto, clientCode, mode);
  return { localSessionId, ttl };
}

export async function removeLocalSession(localSessionAbstract: LocalSessionAbstract, globalSessionId?: string) {
  const resolvedGlobalSessionId = globalSessionId
    ?? await getGlobalSessionIdByLocalSession(localSessionAbstract.localSessionId);
  const transaction = redis.multi()
    .del(localSessionKey(localSessionAbstract.clientCode, localSessionAbstract.localSessionId))
    .del(localSessionReverseKey(localSessionAbstract.localSessionId));

  if (resolvedGlobalSessionId) {
    transaction.zrem(localSessionSetKey(resolvedGlobalSessionId), localSessionMember(localSessionAbstract));
  }

  await transaction.exec();

  if (localSessionAbstract.mode === ClientManagementLevel.Independent) {
    const client = await clientService.getClientByCode(localSessionAbstract.clientCode);
    if (!client) {
      return;
    }
    try {
      const response = await fetch(client.extAttributes.logoutEndpoint, {
        method: "POST",
        body: JSON.stringify({
          sid: localSessionAbstract.localSessionId,
        }),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      if (!response.ok) {
        logger.warn({
          clientCode: localSessionAbstract.clientCode,
          localSessionId: localSessionAbstract.localSessionId,
          status: response.status,
        }, "independent client logout endpoint returned non-OK response");
      }
    }
    catch (error) {
      logger.warn({
        err: error,
        clientCode: localSessionAbstract.clientCode,
        localSessionId: localSessionAbstract.localSessionId,
      }, "independent client logout endpoint failed");
    }
  }
}

export async function getGlobalSessionIdByLocalSession(localSessionId: string) {
  const globalSessionId = await redis.get(localSessionReverseKey(localSessionId));
  return globalSessionId;
}

export async function getValidLocalSessions(globalSessionId: string) {
  const now = Date.now();
  const setKey = localSessionSetKey(globalSessionId);
  await redis.zremrangebyscore(setKey, "-inf", now);
  const members = await redis.zrange(setKey, 0, -1);
  const validSessions: LocalSessionAbstract[] = [];
  await Promise.all(members.map(async (member) => {
    try {
      validSessions.push(LocalSessionAbstractSchema.parse(JSON.parse(member, reviveIsoDates)));
    }
    catch (error) {
      logger.warn({ err: error, member, globalSessionId }, "invalid local session set member");
      await redis.zrem(setKey, member);
    }
  }));
  return validSessions;
}

export async function getValidatedLocalSessionUserString(clientCode: string, localSessionId: string) {
  const localKey = localSessionKey(clientCode, localSessionId);
  const reverseKey = localSessionReverseKey(localSessionId);
  const userString = await redis.get(localKey);
  if (!userString) {
    return null;
  }

  const globalSessionId = await redis.get(reverseKey);
  if (!globalSessionId) {
    await bestEffortDelete([localKey, reverseKey]);
    return null;
  }

  const globalSession = await redis.get(globalSessionKey(globalSessionId));
  if (!globalSession) {
    await bestEffortDelete([localKey, reverseKey]);
    await redis.zrem(localSessionSetKey(globalSessionId), localSessionMember({
      clientCode,
      localSessionId,
      mode: ClientManagementLevel.Gateway,
    }));
    await redis.zrem(localSessionSetKey(globalSessionId), localSessionMember({
      clientCode,
      localSessionId,
      mode: ClientManagementLevel.Independent,
    }));
    return null;
  }

  return userString;
}

export async function setGlobalSession(user: UserDetailDto) {
  const sessionId = crypto.randomUUID();
  await redis.set(globalSessionKey(sessionId), JSON.stringify(user), "EX", config.REDIS_EXPIRE_TIME);

  return sessionId;
}

export async function removeGlobalSession(globalSessionId: string) {
  await Promise.all([
    redis.del(globalSessionKey(globalSessionId)),
    redis.del(localSessionSetKey(globalSessionId)),
  ]);
}
