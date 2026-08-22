import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { DbClient } from "@iam/db";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";
import { createAccountRecoveryService } from "@api/services/account-recovery/account-recovery.service";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { createClientService } from "@api/services/client/client.service";
import {
  createCustomSsoClientRuntimeReader,
} from "@api/services/client/custom-sso-client-runtime.reader";
import { createCustomSsoClientSecretVerifier } from "@api/services/client/custom-sso-client-secret-verifier";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createOrganizationService } from "@api/services/organization/organization.service";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import {
  createCustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import {
  createCustomSsoSubjectDelivery,
} from "@api/services/sso/custom-sso-subject-delivery";
import {
  createCustomSsoSubjectDeliveryRequestScope,
} from "@api/services/sso/custom-sso-subject-delivery-request-scope";
import { createCustomSsoTrafficGate } from "@api/services/sso/custom-sso-traffic-gate";
import { createSsoRedirectUrlValidator } from "@api/services/sso/redirect-url.validator";
import { createUserDelegationQuery } from "@api/services/user/user-delegation-query.helper";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import {
  createAuthorizationGrantRedemption,
  createAuthorizationGrantRedemptionCleanupAdapter,
  createRedisAuthorizationGrantRedemptionStore,
} from "@iam/api-core/authorization-grant";
import { createClientTrafficGateReader } from "@iam/api-core/client-traffic-gate";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createLoginRestriction,
  createRedisLoginRestrictionStore,
} from "@iam/api-core/login-restriction";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessPrincipalValidator,
} from "@iam/api-core/subject-access";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { createClientSubjectProjectionService } from "@iam/client-subject-projection";
import db from "@iam/db";
import {
  createInternalUserProfileQueryRepository,
  createInternalUserProfileQueryService,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model";
import { createUserProfileQueryService } from "@iam/user-profile-read-model/query";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import {
  createSubjectFactsLoggerObservability,
} from "@iam/user-profile-read-model/subject-facts";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiServicesOptions {
  runtime: ApiRuntimePorts;
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  unitOfWork: ApiUnitOfWork;
  userProfileQueryDb: DbClient;
}

function createApiSubjectAccess(
  runtime: Pick<ApiRuntimePorts, "clock" | "random" | "redis">,
) {
  return createSubjectAccessBarrier({
    clock: runtime.clock,
    random: runtime.random,
    store: createRedisSubjectAccessStore({
      redis: runtime.redis,
    }),
  });
}

export function createApiServices(options: CreateApiServicesOptions) {
  const { runtime, repositories, auditLogWriter, unitOfWork } = options;

  const subjectAccess = createApiSubjectAccess(runtime);
  const subjectAccessPrincipal = createSubjectAccessPrincipalValidator(subjectAccess);
  const authorizationGrantRedemptionStore = createRedisAuthorizationGrantRedemptionStore({
    redis: runtime.redis,
  });
  const sessionKernel = createSessionKernel({
    redis: runtime.redis as SessionKernelRedis,
    config: {
      ...runtime.config.sessionKernel,
      clock: runtime.clock,
    },
    principalAccessFence: subjectAccessPrincipal,
    cleanupAdapters: [
      createAuthorizationGrantRedemptionCleanupAdapter(authorizationGrantRedemptionStore),
    ],
    logger: runtime.logger,
    sourceApp: LoggerSourceApp.Api,
  });
  const subjectAccessLifecycle = createSubjectAccessLifecycle({
    barrier: subjectAccess,
    logger: runtime.logger,
    random: runtime.random,
    transitionIntent: createSubjectAccessTransitionRepository(db),
  });
  const authorizationGrantRedemption = createAuthorizationGrantRedemption({
    leaseDurationMs: 5_000,
    random: runtime.random,
    store: authorizationGrantRedemptionStore,
  });
  const subjectFacts = createSubjectFactsReader({
    db,
    cache: createSubjectFactsRedisCache(runtime.redis),
    observability: createSubjectFactsLoggerObservability(runtime.logger),
  });
  const subjectProjection = createClientSubjectProjectionService({
    subjectAccess,
    subjectFacts,
    authorizationFreshness: subjectFacts,
  });

  const clientService = createClientService({
    redis: runtime.redis,
    clientRepository: repositories.client,
  });
  const customSsoClientRuntime = createCustomSsoClientRuntimeReader({
    redis: runtime.redis,
    source: repositories.customSsoClient,
  });
  const clientTrafficGate = createClientTrafficGateReader({
    redis: runtime.redis,
    source: repositories.client,
  });
  const customSsoTrafficGate = createCustomSsoTrafficGate({
    gate: clientTrafficGate,
  });
  const customSsoClientCredentials = createCustomSsoClientSecretVerifier({
    repository: repositories.customSsoClient,
  });
  const customSsoSubjectDelivery = createCustomSsoSubjectDelivery({
    clients: customSsoClientRuntime,
    projection: subjectProjection,
  });
  const customSsoSubjectDeliveryRequests
    = createCustomSsoSubjectDeliveryRequestScope();

  const mobileService = createMobileService({
    redis: runtime.redis,
    smsSender: runtime.integrations.sms,
    userRepository: repositories.user,
    config: {
      verificationCodeTtlSeconds: 180,
    },
  });

  const humanRiskService = createHumanRiskService({
    redis: runtime.redis,
    config: {
      capEnabled: runtime.config.cap.enabled,
      windowSeconds: runtime.config.humanVerification.windowSeconds,
      loginFailureThreshold: runtime.config.humanVerification.loginFailureThreshold,
      lookupThreshold: runtime.config.humanVerification.lookupThreshold,
    },
  });

  const capService = createCapService({
    capClient: runtime.integrations.cap,
    redis: runtime.redis,
    logger: runtime.logger,
    riskService: humanRiskService,
    config: {
      capEnabled: runtime.config.cap.enabled,
      siteKey: runtime.config.cap.siteKey,
      secret: runtime.config.cap.secret,
      challengeTtlMs: runtime.config.cap.challengeTtlMs,
      tokenTtlSeconds: runtime.config.cap.tokenTtlSeconds,
    },
  });

  const userProfileQuery = createUserProfileQueryService({
    profileRepository: repositories.userProfile,
  });
  const internalUserProfileQuery = createInternalUserProfileQueryService({
    profileRepository: createInternalUserProfileQueryRepository(
      options.userProfileQueryDb,
    ),
  });

  const userDelegationQuery = createUserDelegationQuery({
    profileQuery: userProfileQuery,
    privilegeDelegationRepository: repositories.privilegeDelegation,
  });

  const userMobileBinding = createUserMobileBinding({
    mobileService,
    auditLogWriter,
  });

  const userPasswordHelper = createUserPasswordHelper({
    passwordHasher: runtime.passwordHasher,
  });

  const userService = createUserService({
    userRepository: repositories.user,
    mobileService,
    profileQuery: userProfileQuery,
    userDelegationQuery,
    mobileBinding: userMobileBinding,
    passwordHelper: userPasswordHelper,
    sessionRevocation: {
      revokeUserSessions: async ({
        reason,
        onlySubjectAccessTransitionId,
        subjectIdentifier,
      }) => await sessionKernel.revokeUserSessions({
        principalType: "user",
        subjectId: subjectIdentifier,
      }, reason, { onlySubjectAccessTransitionId }),
    },
    subjectAccessLifecycle,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
      subjectAccessMutation: tx.subjectAccessMutation,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const accountRecoveryService = createAccountRecoveryService({
    userLookup: userService,
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const privilegeDelegationService = createPrivilegeDelegationService({
    privilegeDelegationRepository: repositories.privilegeDelegation,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      organizationRepository: tx.repositories.organization,
      privilegeRepository: tx.repositories.privilege,
      privilegeDelegationRepository: tx.repositories.privilegeDelegation,
    })),
  });

  const customSsoSession = createCustomSsoSessionKernelAdapter({
    authorizationGrantRedemption,
    clients: customSsoClientRuntime,
    kernel: sessionKernel,
    logger: runtime.logger,
    orcas: runtime.integrations.orcas,
    random: runtime.random,
    subjectDelivery: customSsoSubjectDelivery,
    subjectProjection,
    userService,
    auditLogWriter,
    clock: runtime.clock,
    config: {
      authCodeExpireSeconds: runtime.config.auth.authCodeExpireSeconds,
      localSessionTtlSeconds: runtime.config.auth.redisExpireSeconds,
    },
  });

  const loginRestriction = createLoginRestriction({
    clock: runtime.clock,
    random: runtime.random,
    store: createRedisLoginRestrictionStore({
      redis: runtime.redis,
    }),
  });

  const loginCredentialParser = createLoginCredentialParser({
    clock: runtime.clock,
    nonceStore: runtime.redis,
    config: {
      privateKeysByKid: runtime.config.loginCredential.privateKeysByKid,
      maxSkewMs: runtime.config.loginCredential.maxSkewMs,
      nonceTtlSeconds: runtime.config.loginCredential.nonceTtlSeconds,
    },
  });

  const ssoRedirectUrl = createSsoRedirectUrlValidator({
    logger: runtime.logger,
  });

  return {
    accountRecovery: accountRecoveryService,
    cap: capService,
    client: clientService,
    customSsoClientCredentials,
    customSsoClientRuntime,
    customSsoSession,
    customSsoSubjectDelivery,
    customSsoSubjectDeliveryRequests,
    customSsoTrafficGate,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    loginRestriction,
    mobile: mobileService,
    organization: organizationService,
    privilegeDelegation: privilegeDelegationService,
    ssoRedirectUrl,
    subjectAccess,
    subjectAccessLifecycle,
    user: userService,
    userPassword: userPasswordHelper,
    userProfileQuery,
    internalUserProfileQuery,
  };
}

export type ApiServices = ReturnType<typeof createApiServices>;
