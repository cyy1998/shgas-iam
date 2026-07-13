import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type {
  AuditActorType,
  AuditDetails,
  AuditOutcome,
} from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";
import type { PasswordLoginUser } from "./login-with-password.type";

export interface PasswordLoginAuditInput {
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

export interface PasswordLoginFailureResult {
  failureCount: number;
  remainingAttempts: number;
  shouldBlacklist: boolean;
}

export interface LoginWithPasswordDeps {
  auditLogWriter: {
    recordAuditLog: (input: PasswordLoginAuditInput) => Promise<void>;
  };
  config: {
    magicCode: string;
  };
  humanRisk: {
    recordLoginFailure: (action: HumanVerificationAction.PasswordLogin, context: {
      subject?: string;
      ip?: string;
      requestId?: string | null;
      traceId?: string | null;
    }) => Promise<void>;
  };
  humanVerification: {
    ensureActionAllowed: (action: HumanVerificationAction.PasswordLogin, token: string | undefined, context: {
      subject?: string;
      ip?: string;
      requestId?: string | null;
      traceId?: string | null;
    }) => Promise<void>;
  };
  loginFailure: {
    recordLoginFailure: (userId: number) => Promise<PasswordLoginFailureResult>;
    blacklistLoginUser: (userId: number, reason: "password") => Promise<void>;
    clearLoginFailures: (userId: number) => Promise<void>;
    clearLoginBlacklist: (userId: number) => Promise<void>;
    isLoginUserBlacklisted: (userId: number) => Promise<boolean>;
    formatLoginBlacklistMessage: (userId: number) => Promise<string>;
    formatLoginFailureMessage: (prefix: string, result: PasswordLoginFailureResult) => string;
  };
  principalSessions: {
    createPrincipalSession: (
      user: UserDetailDto,
      options: { amr?: string[] },
    ) => Promise<{ token: string }>;
  };
  users: {
    checkPassword: (username: string, password: string) => Promise<boolean>;
    getActiveUserByUsername: (username: string) => Promise<PasswordLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
}
