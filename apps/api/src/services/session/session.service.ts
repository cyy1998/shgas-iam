import type { UserDetailDto } from "../user/user.type";
import type { SessionServiceDeps } from "./session.port";
import type { LocalSessionAbstract } from "./session.type";
import { buildLocalLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { SystemLogEvent } from "@iam/api-core/logger";
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

export function createSessionService(deps: SessionServiceDeps) {
  async function updateSession(sessionId: string, user: UserDetailDto) {
    return await replaceGlobalSessionUser(
      deps.redis,
      sessionId,
      user,
      UserDetailDtoSchema,
      deps.config.redisExpireSeconds,
      deps.logger,
    );
  }

  async function setLocalSession(
    globalSessionId: string,
    clientCode: string,
    userDetailDto: UserDetailDto,
    mode: ClientManagementLevel,
  ) {
    if (await getGlobalSession(globalSessionId) === null) {
      throw new AuthzUnauthorizedError("全局session不存在或已过期");
    }
    const localSessionId = deps.random.uuid();
    const reference = { clientCode, localSessionId, mode };
    const ttl = await writeLocalSession(deps.redis, globalSessionId, reference, userDetailDto, deps.logger);
    await deps.auditLogWriter.recordAuditLog(buildLocalLoginSuccessAudit(userDetailDto, clientCode, mode));
    return { localSessionId, ttl };
  }

  async function removeLocalSession(reference: LocalSessionAbstract, globalSessionId?: string) {
    await removeSharedLocalSession(deps.redis, reference, globalSessionId);

    if (reference.mode !== ClientManagementLevel.Independent)
      return;
    const client = await deps.clientService.getClientByCode(reference.clientCode);
    if (!client)
      return;

    try {
      const response = await fetch(client.extAttributes.logoutEndpoint, {
        method: "POST",
        body: JSON.stringify({ sid: reference.localSessionId }),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      if (!response.ok) {
        deps.logger.warn({
          event: SystemLogEvent.SessionNotificationUnexpectedResponse,
          clientCode: reference.clientCode,
          localSessionId: reference.localSessionId,
          status: response.status,
        }, "independent client logout endpoint returned non-OK response");
      }
    }
    catch (error) {
      deps.logger.warn({
        event: SystemLogEvent.SessionNotificationFailed,
        err: error,
        clientCode: reference.clientCode,
        localSessionId: reference.localSessionId,
      }, "independent client logout endpoint failed");
    }
  }

  async function getGlobalSessionIdByLocalSession(localSessionId: string) {
    return await getSharedGlobalSessionIdByLocalSession(deps.redis, localSessionId);
  }

  async function getValidLocalSessions(globalSessionId: string) {
    return await listLocalSessions(deps.redis, globalSessionId, LocalSessionAbstractSchema, deps.logger);
  }

  async function getValidatedLocalSessionUserString(clientCode: string, localSessionId: string) {
    const user = await readValidatedLocalSessionUser(
      deps.redis,
      clientCode,
      localSessionId,
      UserDetailDtoSchema,
      deps.logger,
    );
    return user === null ? null : JSON.stringify(user);
  }

  async function getGlobalSession(globalSessionId: string) {
    return await readGlobalSession(deps.redis, globalSessionId, UserDetailDtoSchema, deps.logger);
  }

  async function renewGlobalSession(globalSessionId: string) {
    return await renewSharedGlobalSession(
      deps.redis,
      globalSessionId,
      deps.config.redisExpireSeconds,
      LocalSessionAbstractSchema,
      deps.logger,
    );
  }

  async function setGlobalSession(user: UserDetailDto) {
    const { sessionId } = await createGlobalSession(deps.redis, user, deps.config.redisExpireSeconds);
    return sessionId;
  }

  async function removeGlobalSession(globalSessionId: string) {
    await Promise.all([
      removeSharedGlobalSession(deps.redis, globalSessionId),
      deps.tokenRevoker.revokeOidcAccessTokensForGlobalSession(deps.redis, globalSessionId),
    ]);
  }

  return {
    updateSession,
    setLocalSession,
    removeLocalSession,
    getGlobalSessionIdByLocalSession,
    getValidLocalSessions,
    getValidatedLocalSessionUserString,
    getGlobalSession,
    renewGlobalSession,
    setGlobalSession,
    removeGlobalSession,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
