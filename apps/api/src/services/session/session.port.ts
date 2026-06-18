import type { LoggerPort, RandomPort, RedisPort } from "@api/composition/runtime";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { ClientService } from "@api/services/client/client.service";

export interface SessionTokenRevokerPort {
  revokeOidcAccessTokensForGlobalSession: (redis: RedisPort, globalSessionId: string) => Promise<unknown>;
}

export interface SessionServiceDeps {
  redis: RedisPort;
  logger: LoggerPort;
  random: Pick<RandomPort, "uuid">;
  clientService: Pick<ClientService, "getClientByCode">;
  auditLogWriter: AuditLogWriterPort;
  tokenRevoker: SessionTokenRevokerPort;
  config: {
    redisExpireSeconds: number;
  };
}
