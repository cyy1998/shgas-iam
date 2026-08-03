import type { SessionOrigin } from "@api/services/session/session-origin";
import type {
  AuditActorType,
  AuditDetails,
  AuditOutcome,
} from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";
import type { OaLoginUser } from "./login-with-oa.type";

export interface OaLoginAuditInput {
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: number | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorClientCode?: string | null;
  actorSystemKey?: string | null;
  targetType: string;
  targetId?: number | null;
  targetCode?: string | null;
  targetName?: string | null;
  sourceApp?: string;
  requestId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  details?: AuditDetails;
}

export interface OaPrincipalSessionPort {
  createPrincipalSession: (
    subjectIdentifier: string,
    options: {
      amr: readonly ["oa"];
      origin?: SessionOrigin;
    },
  ) => Promise<{ token: string }>;
}

export interface LoginWithOaDeps {
  auditLogWriter: {
    recordAuditLog: (input: OaLoginAuditInput) => Promise<void>;
  };
  clients: {
    getClientByCode: (clientCode: string) => Promise<{ clientSecret: string } | null>;
  };
  clock: {
    now: () => number;
  };
  config: {
    nodeEnv: string;
  };
  principalSessions: OaPrincipalSessionPort;
  users: {
    getActiveUserByUsername: (username: string) => Promise<OaLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
}
