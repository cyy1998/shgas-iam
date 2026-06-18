import type { ClockPort, LoggerPort, RandomPort, RedisPort } from "@api/composition/runtime";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { ClientService } from "@api/services/client/client.service";
import type { SessionService } from "@api/services/session/session.service";
import type { UserService } from "@api/services/user/user.service";
import type { UserDetailDto } from "@api/services/user/user.type";

export interface OrcasPort {
  orcasLogin: (user: UserDetailDto) => Promise<{ orcasSessionId: string; orcasId: string }>;
}

export interface WechatPort {
  getWxUserId: (code: string) => Promise<string>;
}

export interface SsoServiceDeps {
  redis: Pick<RedisPort, "get" | "set" | "getdel" | "del">;
  logger: LoggerPort;
  random: Pick<RandomPort, "uuid">;
  clock: Pick<ClockPort, "now">;
  orcasClient: OrcasPort;
  wechatClient: WechatPort;
  clientService: Pick<ClientService, "getClientByCode">;
  sessionService: Pick<
    SessionService,
    | "setLocalSession"
    | "renewGlobalSession"
    | "getGlobalSession"
    | "getValidLocalSessions"
    | "removeLocalSession"
    | "removeGlobalSession"
    | "setGlobalSession"
  >;
  userService: Pick<UserService, "getUserDetailByUsername" | "getUserDetailByWxId">;
  auditLogWriter: AuditLogWriterPort;
  config: {
    nodeEnv: string;
    authCodeExpireSeconds: number;
  };
}
