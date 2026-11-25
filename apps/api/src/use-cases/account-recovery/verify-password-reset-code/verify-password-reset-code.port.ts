import type { AuditLogInput } from "@iam/contracts/audit";

export interface PasswordResetCodeVerificationAuditWriterPort {
  recordAuditLog: (input: AuditLogInput) => Promise<void>;
}

export interface VerifyBoundMobileResolverPort {
  resolveBoundMobile: (username?: string, phoneNumber?: string) => Promise<string>;
}

export interface PasswordResetCodeVerifierPort {
  checkVerificationCode: (usage: string, phoneNumber: string, code: string) => Promise<boolean>;
}

export interface VerifyPasswordResetCodeUseCaseDeps {
  auditLogWriter: PasswordResetCodeVerificationAuditWriterPort;
  boundMobileResolver: VerifyBoundMobileResolverPort;
  mobileCodeVerifier: PasswordResetCodeVerifierPort;
}
