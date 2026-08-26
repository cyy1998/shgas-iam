import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createApiUnitOfWork } from "../tx";
import { createRequestPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/request-password-reset-code/request-password-reset-code.use-case";
import { createResetPasswordUseCase } from "@api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { createVerifyPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import { createLoginWithMobileUseCase } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import { createLoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import { createAuthorizeSsoUseCase } from "@api/use-cases/sso/authorize-sso/authorize-sso.use-case";
import { createCheckSsoLoginContinuationUseCase } from "@api/use-cases/sso/check-login-continuation/check-login-continuation.use-case";
import { createCompleteSsoCallbackUseCase } from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.use-case";
import { createExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import { createLoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import { createLoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import { createLogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { sleep } from "bun";
import { createPrivilegeDelegationResolutionRepository } from "../repositories/privilege-delegation-resolution.repository";

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

  const authentication = {
    loginWithMobile: createLoginWithMobileUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginRestriction: services.loginRestriction,
      principalSessions: services.customSsoSession,
      users: services.user,
      verificationCodes: services.mobile,
    }),
    loginWithPassword: createLoginWithPasswordUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginRestriction: services.loginRestriction,
      principalSessions: services.customSsoSession,
      users: services.user,
    }),
  };

  const sso = {
    authorize: createAuthorizeSsoUseCase({
      authorizationGrants: services.customSsoSession,
      clients: services.customSsoClientRuntime,
      redirectUrls: services.ssoRedirectUrl,
      trafficGate: services.customSsoTrafficGate,
    }),
    checkLoginContinuation: createCheckSsoLoginContinuationUseCase({
      clients: services.customSsoClientRuntime,
      principalSessions: services.customSsoSession,
      redirectUrls: services.ssoRedirectUrl,
      trafficGate: services.customSsoTrafficGate,
    }),
    completeCallback: createCompleteSsoCallbackUseCase({
      authorizationGrants: services.customSsoSession,
      clients: services.customSsoClientRuntime,
      trafficGate: services.customSsoTrafficGate,
    }),
    exchangeCode: createExchangeSsoCodeUseCase({
      authorizationGrants: services.customSsoSession,
      clientCredentials: services.customSsoClientCredentials,
      trafficGate: services.customSsoTrafficGate,
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
