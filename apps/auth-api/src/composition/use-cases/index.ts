import { createRequestPasswordResetCodeUseCase } from "@auth-api/use-cases/account-recovery/request-password-reset-code/request-password-reset-code.use-case";
import { createResetPasswordUseCase } from "@auth-api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { createVerifyPasswordResetCodeUseCase } from "@auth-api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import type { AuditLogWriter } from "@iam/db/audit";
import { mapUnitOfWork } from "@iam/unit-of-work";
import type { ApiServices } from "../services";
import type { createAuthApiUnitOfWork } from "../tx";

type ApiUnitOfWork = ReturnType<typeof createAuthApiUnitOfWork>;

export interface CreateApiUseCasesOptions {
  auditLogWriter: AuditLogWriter;
  services: ApiServices;
  unitOfWork: ApiUnitOfWork;
}

export function createApiUseCases(options: CreateApiUseCasesOptions) {
  const { auditLogWriter, services, unitOfWork } = options;

  const accountRecovery = {
    requestPasswordResetCode: createRequestPasswordResetCodeUseCase({
      auditLogWriter,
      boundMobileResolver: services.accountRecovery,
      mobileCodeSender: services.mobile,
    }),
    resetPassword: createResetPasswordUseCase({
      auditLogWriter,
      boundMobileResolver: services.accountRecovery,
      passwordHasher: services.userPassword,
      userLookup: services.user,
      verificationCodes: services.mobile,
      uow: mapUnitOfWork(unitOfWork, (tx) => ({
        auditLogWriter: tx.auditLogWriter,
        userWriter: tx.repositories.user,
      })),
    }),
    verifyPasswordResetCode: createVerifyPasswordResetCodeUseCase({
      auditLogWriter,
      boundMobileResolver: services.accountRecovery,
      mobileCodeVerifier: services.mobile,
    }),
  };

  return {
    accountRecovery,
  };
}

export type ApiUseCases = ReturnType<typeof createApiUseCases>;
