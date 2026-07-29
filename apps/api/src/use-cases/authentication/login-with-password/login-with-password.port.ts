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

export interface PasswordLoginRestrictionPort {
  recordFailure: (input: {
    userId: number;
    triggerMethod: "password";
  }) => Promise<AuthenticationLoginFailureStatus>;
  clearLoginState: (userId: number) => Promise<unknown>;
  getRestriction: (userId: number) => Promise<AuthenticationLoginRestrictionStatus | null>;
}

export interface PasswordPrincipalSessionPort {
  createPrincipalSession: (
    user: UserDetailDto,
    options: {
      amr: readonly ["pwd"];
      origin?: SessionOrigin;
    },
  ) => Promise<{ token: string }>;
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
  loginRestriction: PasswordLoginRestrictionPort;
  principalSessions: PasswordPrincipalSessionPort;
  users: {
    checkPassword: (username: string, password: string) => Promise<boolean>;
    getActiveUserByUsername: (username: string) => Promise<PasswordLoginUser | null>;
    getUserDetailById: (userId: number) => Promise<UserDetailDto>;
  };
}
