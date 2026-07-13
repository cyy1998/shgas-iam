import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type {
  AuditActorType,
  AuditDetails,
  AuditOutcome,
} from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";
import type { MobileLoginUser } from "./login-with-mobile.type";

export interface MobileLoginAuditInput {
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

export interface MobileLoginFailureResult {
  failureCount: number;
  remainingAttempts: number;
  shouldBlacklist: boolean;
}

export interface LoginWithMobileDeps {
  auditLogWriter: {
    recordAuditLog: (input: MobileLoginAuditInput) => Promise<void>;
  };
  config: {
    magicCode: string;
  };
  humanRisk: {
    recordLoginFailure: (action: HumanVerificationAction.MobileLogin, context: {
      subject?: string;
      ip?: string;
      requestId?: string | null;
      traceId?: string | null;
    }) => Promise<void>;
  };
  humanVerification: {
    ensureActionAllowed: (action: HumanVerificationAction.MobileLogin, token: string | undefined, context: {
      subject?: string;
      ip?: string;
      requestId?: string | null;
      traceId?: string | null;
    }) => Promise<void>;
  };
  loginFailure: {
    recordLoginFailure: (userId: number) => Promise<MobileLoginFailureResult>;
    blacklistLoginUser: (userId: number, reason: "mobile") => Promise<void>;
    clearLoginFailures: (userId: number) => Promise<void>;
    clearLoginBlacklist: (userId: number) => Promise<void>;
    isLoginUserBlacklisted: (userId: number) => Promise<boolean>;
    formatLoginBlacklistMessage: (userId: number) => Promise<string>;
    formatLoginFailureMessage: (prefix: string, result: MobileLoginFailureResult) => string;
  };
  principalSessions: {
    createPrincipalSession: (
      user: UserDetailDto,
      options: { amr?: string[] },
    ) => Promise<{ token: string }>;
  };
  users: {
    getActiveUserByMobile: (phoneNumber: string) => Promise<MobileLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
  verificationCodes: {
    consumeVerificationCode: (usage: "login", phoneNumber: string, code: string) => Promise<boolean>;
  };
}
