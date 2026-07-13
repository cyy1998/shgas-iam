import type {
  AuditActorType,
  AuditDetails,
  AuditOutcome,
} from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";
import type { WechatLoginUser } from "./login-with-wechat.type";

export interface WechatLoginAuditInput {
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

export interface LoginWithWechatDeps {
  auditLogWriter: {
    recordAuditLog: (input: WechatLoginAuditInput) => Promise<void>;
  };
  cache: {
    del: (key: string) => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, mode: "EX", ttlSeconds: number) => Promise<unknown>;
  };
  delay: {
    wait: (milliseconds: number) => Promise<void>;
  };
  principalSessions: {
    createPrincipalSession: (
      user: UserDetailDto,
      options: { amr?: string[] },
    ) => Promise<{ token: string }>;
  };
  users: {
    getActiveUserById: (userId: number) => Promise<WechatLoginUser | null>;
    getActiveUserByWxId: (wxId: string) => Promise<WechatLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
  wechat: {
    getWxUserId: (code: string) => Promise<string>;
  };
}
