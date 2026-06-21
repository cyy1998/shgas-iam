import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";
import { createAuthService } from "@api/routes/auth/auth.service";
import { createLoginCredentialParser } from "@api/routes/auth/login-credential.helper";
import { createLoginFailureService } from "@api/routes/auth/login-failure.helper";
import { createOpenService } from "@api/routes/open/open.service";
import { createSsoService } from "@api/routes/sso/sso.service";
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
import { createSessionService } from "@api/services/session/session.service";
import { createUserDelegationQuery } from "@api/services/user/user-delegation-query.helper";
import { createUserDetailBuilder } from "@api/services/user/user-detail.helper";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import { revokeOidcAccessTokensForGlobalSession } from "@iam/api-core/oidc";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import { mapUnitOfWork } from "@iam/api-core/uow";

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

  const userDetailBuilder = createUserDetailBuilder({
    employmentRepository: repositories.employment,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
  });

  const userDelegationQuery = createUserDelegationQuery({
    userRepository: repositories.user,
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
    auditLogWriter,
    userDetailBuilder,
    userDelegationQuery,
    mobileBinding: userMobileBinding,
    passwordHelper: userPasswordHelper,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
    })),
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
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

  const sessionService = createSessionService({
    redis: runtime.redis,
    logger: runtime.logger,
    random: runtime.random,
    clientService,
    auditLogWriter,
    tokenRevoker: { revokeOidcAccessTokensForGlobalSession },
    config: {
      redisExpireSeconds: runtime.config.auth.redisExpireSeconds,
    },
  });

  const customSsoSession = createCustomSsoSessionKernelAdapter({
    kernel: sessionKernel,
    redis: runtime.redis,
    logger: runtime.logger,
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

  const authService = createAuthService({
    userService,
    customSsoSession,
    mobileService,
    humanVerification: capService,
    humanRiskService,
    auditLogWriter,
    loginFailure: loginFailureService,
    config: {
      magicCode: runtime.config.auth.magicCode,
    },
  });

  const openService = createOpenService({ userService });

  const ssoService = createSsoService({
    redis: runtime.redis,
    logger: runtime.logger,
    random: runtime.random,
    clock: runtime.clock,
    orcasClient: runtime.integrations.orcas,
    wechatClient: runtime.integrations.wechat,
    clientService,
    customSsoSession,
    userService,
    auditLogWriter,
    config: {
      nodeEnv: runtime.config.env.NODE_ENV,
      authCodeExpireSeconds: runtime.config.auth.authCodeExpireSeconds,
    },
  });

  return {
    auth: authService,
    cap: capService,
    client: clientService,
    customSsoSession,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    mobile: mobileService,
    open: openService,
    organization: organizationService,
    privilegeDelegation: privilegeDelegationService,
    session: sessionService,
    sso: ssoService,
    user: userService,
  };
}

export type ApiServices = ReturnType<typeof createApiServices>;
