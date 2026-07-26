import type { AuditLogInput } from "@api/services/audit/audit.context";

export interface PasswordResetCodeAuditWriterPort {
  recordAuditLog: (input: AuditLogInput) => Promise<void>;
}

export interface BoundMobileResolverPort {
  resolveBoundMobile: (username?: string, phoneNumber?: string) => Promise<string>;
}

export interface PasswordResetCodeSenderPort {
  sendCode: (phoneNumber: string, usage: string) => Promise<boolean>;
}

export interface RequestPasswordResetCodeUseCaseDeps {
  auditLogWriter: PasswordResetCodeAuditWriterPort;
  boundMobileResolver: BoundMobileResolverPort;
  mobileCodeSender: PasswordResetCodeSenderPort;
}
