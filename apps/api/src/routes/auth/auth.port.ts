import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { CapService } from "@api/services/human-verification/cap.service";
import type { HumanRiskService } from "@api/services/human-verification/human-risk.service";
import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { SessionService } from "@api/services/session/session.service";
import type { UserService } from "@api/services/user/user.service";
import type { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import type { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";

export interface LoginFailurePort {
  recordLoginFailure: (userId: number) => Promise<{
    failureCount: number;
    remainingAttempts: number;
    shouldBlacklist: boolean;
  }>;
  blacklistLoginUser: (userId: number, reason: "password" | "mobile") => Promise<void>;
  clearLoginFailures: (userId: number) => Promise<void>;
  clearLoginBlacklist: (userId: number) => Promise<void>;
  isLoginUserBlacklisted: (userId: number) => Promise<boolean>;
  formatLoginBlacklistMessage: (userId: number) => Promise<string>;
  formatLoginFailureMessage: (prefix: string, result: {
    failureCount: number;
    remainingAttempts: number;
    shouldBlacklist: boolean;
  }) => string;
}

export interface AuthServiceDeps {
  userService: Pick<
    UserService,
    "getUserDetailByUsername" | "checkPassword" | "getActiveUserByMobile" | "getUserDetailByMobile"
  >;
  sessionService: Pick<SessionService, "setGlobalSession" | "getValidatedLocalSessionUserString">;
  mobileService: Pick<MobileService, "consumeVerificationCode">;
  humanVerification: Pick<CapService, "ensureActionAllowed" | "HumanVerificationAction">;
  humanRiskService: Pick<HumanRiskService, "recordLoginFailure">;
  auditLogWriter: AuditLogWriterPort;
  loginFailure: LoginFailurePort;
  config: {
    magicCode: string;
  };
}

export type LoginHumanVerificationOptions = {
  capToken?: string;
  context?: HumanVerificationContext;
};

export type LoginErrorClass = typeof LoginFailedError | typeof InvalidVerificationCodeError;
