import type { AuditLogInput } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { AccountRecoveryUser, PasswordResetCodeReservation } from "./reset-password.type";

export interface ResetPasswordAuditWriterPort {
  recordAuditLog: (input: AuditLogInput) => Promise<void>;
}

export interface ResetPasswordBoundMobileResolverPort {
  resolveBoundMobile: (username?: string, phoneNumber?: string) => Promise<string>;
}

export interface ResetPasswordUserLookupPort {
  getActiveUserByUsername: (username: string) => Promise<AccountRecoveryUser | null>;
}

export interface ResetPasswordVerificationCodePort {
  reserveVerificationCode: (
    usage: string,
    phoneNumber: string,
    code: string,
  ) => Promise<PasswordResetCodeReservation | null>;
  confirmReservedVerificationCode: (reservation: PasswordResetCodeReservation) => Promise<boolean>;
  releaseReservedVerificationCode: (reservation: PasswordResetCodeReservation) => Promise<void>;
}

export interface ResetPasswordHasherPort {
  hashUserPassword: (password: string) => Promise<string>;
}

export interface ResetPasswordTransactionPorts {
  auditLogWriter: ResetPasswordAuditWriterPort;
  userWriter: {
    setPassword: (userId: number, passwordHash: string) => Promise<unknown>;
  };
}

export interface ResetPasswordUseCaseDeps {
  auditLogWriter: ResetPasswordAuditWriterPort;
  boundMobileResolver: ResetPasswordBoundMobileResolverPort;
  passwordHasher: ResetPasswordHasherPort;
  userLookup: ResetPasswordUserLookupPort;
  verificationCodes: ResetPasswordVerificationCodePort;
  uow: UnitOfWorkPort<ResetPasswordTransactionPorts>;
}
