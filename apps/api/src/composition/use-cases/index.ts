import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createApiUnitOfWork } from "../tx";
import { createRequestPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/request-password-reset-code/request-password-reset-code.use-case";
import { createResetPasswordUseCase } from "@api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { createVerifyPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import { createCheckSsoLoginContinuationUseCase } from "@api/use-cases/sso/check-login-continuation/check-login-continuation.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { createPrivilegeDelegationResolutionRepository } from "../repositories/privilege-delegation-resolution.repository";
import { createAuthenticationUseCases } from "./authentication";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiUseCasesOptions {
  auditLogWriter: ApiAuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  unitOfWork: ApiUnitOfWork;
  delegationResolutionDb: DbClient;
}

export function createApiUseCases(options: CreateApiUseCasesOptions) {
  const {
    auditLogWriter,
    runtime,
    services,
    unitOfWork,
  } = options;

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
      uow: mapUnitOfWork(unitOfWork, tx => ({
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

  const authentication = createAuthenticationUseCases({ auditLogWriter, runtime, services });

  const sso = {
    ...services.customSso,
    checkLoginContinuation: createCheckSsoLoginContinuationUseCase(services.customSso),
  };

  const registerPurveyorContact = createRegisterPurveyorContactUseCase({
    auditLogWriter,
    config: {
      nodeEnv: runtime.config.env.nodeEnv,
    },
    mobileService: services.mobile,
    random: runtime.random,
    subjectAccessLifecycle: services.subjectAccessLifecycle,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      subjectAccessMutation: tx.subjectAccessMutation,
      userRepository: tx.repositories.user,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
    userReader: services.user,
  });

  const resolvePrivilegeDelegations = createResolvePrivilegeDelegationsUseCase({
    clock: runtime.clock,
    resolution: createPrivilegeDelegationResolutionRepository(
      options.delegationResolutionDb,
    ),
  });

  return {
    accountRecovery,
    authentication,
    registerPurveyorContact,
    resolvePrivilegeDelegations,
    sso,
  };
}

export type ApiUseCases = ReturnType<typeof createApiUseCases>;
