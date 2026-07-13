import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createApiUnitOfWork } from "../tx";
import { createRequestPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/request-password-reset-code/request-password-reset-code.use-case";
import { createResetPasswordUseCase } from "@api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { createVerifyPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import { createLoginWithMobileUseCase } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import { createLoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createAuthorizeSsoUseCase } from "@api/use-cases/sso/authorize-sso/authorize-sso.use-case";
import { createCompleteSsoCallbackUseCase } from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.use-case";
import { createExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import { createLoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import { createLoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import { createLogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { sleep } from "bun";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiUseCasesOptions {
  auditLogWriter: ApiAuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  unitOfWork: ApiUnitOfWork;
}

export function createApiUseCases(options: CreateApiUseCasesOptions) {
  const { auditLogWriter, runtime, services, unitOfWork } = options;

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

  const authentication = {
    loginWithMobile: createLoginWithMobileUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginFailure: services.loginFailure,
      principalSessions: services.customSsoSession,
      users: services.user,
      verificationCodes: services.mobile,
    }),
    loginWithPassword: createLoginWithPasswordUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginFailure: services.loginFailure,
      principalSessions: services.customSsoSession,
      users: services.user,
    }),
  };

  const sso = {
    authorize: createAuthorizeSsoUseCase({
      clients: services.client,
      principalSessions: services.customSsoSession,
      redirectUrls: services.ssoRedirectUrl,
    }),
    completeCallback: createCompleteSsoCallbackUseCase({
      clients: services.client,
      orcas: runtime.integrations.orcas,
      redirectUrls: services.ssoRedirectUrl,
      sessions: services.customSsoSession,
    }),
    exchangeCode: createExchangeSsoCodeUseCase({
      clients: services.client,
      sessions: services.customSsoSession,
    }),
    loginWithOa: createLoginWithOaUseCase({
      auditLogWriter,
      clients: services.client,
      clock: runtime.clock,
      config: { nodeEnv: runtime.config.env.nodeEnv },
      principalSessions: services.customSsoSession,
      users: services.user,
    }),
    loginWithWechat: createLoginWithWechatUseCase({
      auditLogWriter,
      cache: {
        del: key => runtime.redis.del(key),
        get: key => runtime.redis.get(key),
        set: (key, value, mode, ttlSeconds) => runtime.redis.set(key, value, mode, ttlSeconds),
      },
      delay: { wait: sleep },
      principalSessions: services.customSsoSession,
      users: services.user,
      wechat: runtime.integrations.wechat,
    }),
    logout: createLogoutSsoSessionUseCase({
      sessions: services.customSsoSession,
    }),
  };

  const registerPurveyorContact = createRegisterPurveyorContactUseCase({
    auditLogWriter,
    config: {
      nodeEnv: runtime.config.env.nodeEnv,
    },
    mobileService: services.mobile,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      userRepository: tx.repositories.user,
      profileDirtyMarker: tx.profileDirtyMarker,
    })),
  });

  return { accountRecovery, authentication, registerPurveyorContact, sso };
}

export type ApiUseCases = ReturnType<typeof createApiUseCases>;
