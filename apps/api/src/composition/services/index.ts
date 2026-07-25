import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";
import { createAccountRecoveryService } from "@api/services/account-recovery/account-recovery.service";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { createLoginFailureService } from "@api/services/authentication/login-failure.service";
import { createClientService } from "@api/services/client/client.service";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createOrganizationService } from "@api/services/organization/organization.service";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import {
  createCustomSsoCleanupAdapter,
  createCustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import { createSsoRedirectUrlValidator } from "@api/services/sso/redirect-url.validator";
import { createUserDelegationQuery } from "@api/services/user/user-delegation-query.helper";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import { LoggerSourceApp } from "@iam/api-core/logger";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { createUserProfileQueryService } from "@iam/user-profile-read-model/query";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiServicesOptions {
  runtime: ApiRuntimePorts;
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  unitOfWork: ApiUnitOfWork;
}

export function createApiServices(options: CreateApiServicesOptions) {
  const { runtime, repositories, auditLogWriter, unitOfWork } = options;

  const customSsoCleanupAdapter = createCustomSsoCleanupAdapter({
    redis: runtime.redis,
    logger: runtime.logger,
    fetch: globalThis.fetch.bind(globalThis),
  });

  const sessionKernel = createSessionKernel({
    redis: runtime.redis as SessionKernelRedis,
    config: {
      ...runtime.config.sessionKernel,
      clock: runtime.clock,
    },
    cleanupAdapters: [customSsoCleanupAdapter],
    logger: runtime.logger,
    sourceApp: LoggerSourceApp.Api,
  });

  const clientService = createClientService({
    redis: runtime.redis,
    clientRepository: repositories.client,
  });

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
    config: {
      dslDefaultLimit: runtime.config.userProfile.dslMaxLimit,
    },
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
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
      profileDirtyMarker: tx.profileDirtyMarker,
    })),
  });

  const accountRecoveryService = createAccountRecoveryService({
    userLookup: userService,
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
      profileDirtyMarker: tx.profileDirtyMarker,
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
    kernel: sessionKernel,
    redis: runtime.redis,
    logger: runtime.logger,
    orcas: runtime.integrations.orcas,
    userService,
    auditLogWriter,
    clock: runtime.clock,
    config: {
      authCodeExpireSeconds: runtime.config.auth.authCodeExpireSeconds,
      localSessionTtlSeconds: runtime.config.auth.redisExpireSeconds,
    },
  });

  const loginFailureService = createLoginFailureService({
    redis: runtime.redis,
    clock: runtime.clock,
    random: runtime.random,
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
    customSsoSession,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    loginFailure: loginFailureService,
    mobile: mobileService,
    organization: organizationService,
    privilegeDelegation: privilegeDelegationService,
    ssoRedirectUrl,
    user: userService,
    userPassword: userPasswordHelper,
    userProfileQuery,
  };
}

export type ApiServices = ReturnType<typeof createApiServices>;
