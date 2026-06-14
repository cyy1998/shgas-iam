import type { UserDetailDto } from "../user/user.type";
import type { LocalSessionAbstract } from "./session.type";
import config from "@api/env";
import redis from "@api/lib/infra/redis";
import { logger } from "@api/lib/logger";
import * as authAudit from "@api/services/audit/events/auth.audit";
import * as clientService from "@api/services/client/client.service";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { revokeOidcAccessTokensForGlobalSession } from "@iam/api-core/oidc";
import {
  createGlobalSession,
  getGlobalSessionIdByLocalSession as getSharedGlobalSessionIdByLocalSession,
  listLocalSessions,
  readGlobalSession,
  readValidatedLocalSessionUser,
  removeGlobalSession as removeSharedGlobalSession,
  removeLocalSession as removeSharedLocalSession,
  renewGlobalSession as renewSharedGlobalSession,
  replaceGlobalSessionUser,
  writeLocalSession,
} from "@iam/api-core/session";
import { ClientManagementLevel } from "@iam/contracts";
import { LocalSessionAbstractSchema } from "./session.schema";

export async function updateSession(sessionId: string, user: UserDetailDto) {
  return await replaceGlobalSessionUser(
    redis,
    sessionId,
    user,
    UserDetailDtoSchema,
    config.REDIS_EXPIRE_TIME,
    logger,
  );
}

export async function setLocalSession(
  globalSessionId: string,
  clientCode: string,
  userDetailDto: UserDetailDto,
  mode: ClientManagementLevel,
) {
  if (await getGlobalSession(globalSessionId) === null) {
    throw new AuthzUnauthorizedError("全局session不存在或已过期");
  }
  const localSessionId = crypto.randomUUID();
  const reference = { clientCode, localSessionId, mode };
  const ttl = await writeLocalSession(redis, globalSessionId, reference, userDetailDto, logger);
  await authAudit.recordLocalLoginSuccess(userDetailDto, clientCode, mode);
  return { localSessionId, ttl };
}

export async function removeLocalSession(reference: LocalSessionAbstract, globalSessionId?: string) {
  await removeSharedLocalSession(redis, reference, globalSessionId);

  if (reference.mode !== ClientManagementLevel.Independent)
    return;
  const client = await clientService.getClientByCode(reference.clientCode);
  if (!client)
    return;

  try {
    const response = await fetch(client.extAttributes.logoutEndpoint, {
      method: "POST",
      body: JSON.stringify({ sid: reference.localSessionId }),
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
    });
    if (!response.ok) {
      logger.warn({
        clientCode: reference.clientCode,
        localSessionId: reference.localSessionId,
        status: response.status,
      }, "independent client logout endpoint returned non-OK response");
    }
  }
  catch (error) {
    logger.warn({
      err: error,
      clientCode: reference.clientCode,
      localSessionId: reference.localSessionId,
    }, "independent client logout endpoint failed");
  }
}

export async function getGlobalSessionIdByLocalSession(localSessionId: string) {
  return await getSharedGlobalSessionIdByLocalSession(redis, localSessionId);
}

export async function getValidLocalSessions(globalSessionId: string) {
  return await listLocalSessions(redis, globalSessionId, LocalSessionAbstractSchema, logger);
}

export async function getValidatedLocalSessionUserString(clientCode: string, localSessionId: string) {
  const user = await readValidatedLocalSessionUser(redis, clientCode, localSessionId, UserDetailDtoSchema, logger);
  return user === null ? null : JSON.stringify(user);
}

export async function getGlobalSession(globalSessionId: string) {
  return await readGlobalSession(redis, globalSessionId, UserDetailDtoSchema, logger);
}

export async function renewGlobalSession(globalSessionId: string) {
  return await renewSharedGlobalSession(
    redis,
    globalSessionId,
    config.REDIS_EXPIRE_TIME,
    LocalSessionAbstractSchema,
    logger,
  );
}

export async function setGlobalSession(user: UserDetailDto) {
  const { sessionId } = await createGlobalSession(redis, user, config.REDIS_EXPIRE_TIME);
  return sessionId;
}

export async function removeGlobalSession(globalSessionId: string) {
  await Promise.all([
    removeSharedGlobalSession(redis, globalSessionId),
    revokeOidcAccessTokensForGlobalSession(redis, globalSessionId),
  ]);
}
