import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type { SessionOrigin } from "@api/services/session/session-origin";
import type {
  AuditActorType,
  AuditDetails,
  AuditOutcome,
} from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";
import type {
  AuthenticationLoginFailureStatus,
  AuthenticationLoginRestrictionStatus,
} from "../login-restriction.type";
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

export interface MobileLoginRestrictionPort {
  recordFailure: (input: {
    userId: number;
    triggerMethod: "mobile";
  }) => Promise<AuthenticationLoginFailureStatus>;
  clearLoginState: (userId: number) => Promise<unknown>;
  getRestriction: (userId: number) => Promise<AuthenticationLoginRestrictionStatus | null>;
}

export interface MobilePrincipalSessionPort {
  createPrincipalSession: (
    user: UserDetailDto,
    options: {
      amr: readonly ["sms"];
      origin?: SessionOrigin;
    },
  ) => Promise<{ token: string }>;
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
  loginRestriction: MobileLoginRestrictionPort;
  principalSessions: MobilePrincipalSessionPort;
  users: {
    getActiveUserByMobile: (phoneNumber: string) => Promise<MobileLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
  verificationCodes: {
    consumeVerificationCode: (usage: "login", phoneNumber: string, code: string) => Promise<boolean>;
  };
}
