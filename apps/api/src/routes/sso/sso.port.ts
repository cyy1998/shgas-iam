import type { ClockPort, LoggerPort, RandomPort, RedisPort } from "@api/composition/runtime";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { ClientService } from "@api/services/client/client.service";
import type { CustomSsoPrincipalTokenSource, CustomSsoSessionKernelAdapter } from "@api/services/session/custom-sso-session-kernel.adapter";
import type { UserService } from "@api/services/user/user.service";
import type { UserDetailDto } from "@api/services/user/user.type";

export interface OrcasPort {
  orcasLogin: (user: UserDetailDto) => Promise<{ orcasSessionId: string; orcasId: string }>;
}

export interface WechatPort {
  getWxUserId: (code: string) => Promise<string>;
}

export interface SsoServiceDeps {
  redis: Pick<RedisPort, "get" | "set" | "del">;
  logger: LoggerPort;
  random?: Pick<RandomPort, "uuid">;
  clock: Pick<ClockPort, "now">;
  orcasClient: OrcasPort;
  wechatClient: WechatPort;
  clientService: Pick<ClientService, "getClientByCode">;
  customSsoSession: Pick<
    CustomSsoSessionKernelAdapter,
    | "authorize"
    | "consumeAuthCode"
    | "createLocalSession"
    | "createPrincipalSession"
    | "logout"
  >;
  userService: Pick<UserService, "getUserDetailByUsername" | "getUserDetailByWxId">;
  auditLogWriter: AuditLogWriterPort;
  config: {
    nodeEnv: string;
    authCodeExpireSeconds: number;
  };
}

export type { CustomSsoPrincipalTokenSource };
