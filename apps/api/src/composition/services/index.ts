import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";
import { createAccountRecoveryService } from "@api/services/account-recovery/account-recovery.service";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { createClientService } from "@api/services/client/client.service";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createOrganizationService } from "@api/services/organization/organization.service";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import { createV3UserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search-v3.adapter";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/api-core/client-snapshot/credentials";
import { createLoginRestriction, createRedisLoginRestrictionStore } from "@iam/api-core/login-restriction";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
} from "@iam/api-core/subject-access";
import { mapUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { createOidcClientAuthRateLimiter } from "@iam/oidc";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createInternalUserProfileQueryRepository,
  createInternalUserProfileQueryService,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model";
import { createUserProfileQueryService } from "@iam/user-profile-read-model/query";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { createSubjectFactsLoggerObservability } from "@iam/user-profile-read-model/subject-facts";
import {
  createV3UserProfileQueryRepository,
  createV3UserProfileQueryService,
} from "@iam/user-profile-read-model/v3";
import { createRootAuthenticationComposition } from "../root-authentication";
import { createApiUserProfileSearch } from "./user-profile-search";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiServicesOptions {
  runtime: ApiRuntimePorts;
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  unitOfWork: ApiUnitOfWork;
  userProfileQueryDb: DbClient;
}

function createApiSubjectAccess(runtime: Pick<ApiRuntimePorts, "clock" | "random" | "redis">) {
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
  const sessionKernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis: runtime.redis,
    ...runtime.config.sessionKernel,
    assertOperationActive: (operation) => {
      requireSubjectAccessOperation(operation);
    },
  });
  const subjectAccessLifecycle = createSubjectAccessLifecycle({
    barrier: subjectAccess,
    logger: runtime.logger,
    random: runtime.random,
    transitionIntent: createSubjectAccessTransitionRepository(db),
  });
  let subjectAccessOperations: ReturnType<typeof createSubjectAccessOperations>;
  const sessionRevocation = createUnifiedSubjectAccessSessionRevocation(sessionKernel, {
    run: callback => subjectAccessOperations.run(callback),
  });
  subjectAccessOperations = createSubjectAccessOperations({
    barrier: subjectAccess,
    revocation: sessionRevocation,
  });
  const subjectFacts = createSubjectFactsReader({
    db,
    cache: createSubjectFactsRedisCache(runtime.redis),
    observability: createSubjectFactsLoggerObservability(runtime.logger),
  });
  const clientService = createClientService({
    redis: runtime.redis,
    clientRepository: repositories.client,
  });
  const clientSnapshots = createClientSnapshots({
    redis: runtime.redis,
    source: createClientSnapshotRepository(db),
  });
  const credentials = createClientSecretAuthenticator(clientSnapshots.credential);

  const mobileService = createMobileService({
    cooldown: createMobileCodeCooldown(runtime.redis),
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
    profileRepository: createInternalUserProfileQueryRepository(options.userProfileQueryDb),
  });
  const canonicalUserProfileSearch = createV3UserProfileSearchAdapter(
    createV3UserProfileQueryService({
      profileRepository: createV3UserProfileQueryRepository(options.userProfileQueryDb),
    }),
  );
  const { userDelegationQuery, userProfileSearch } = createApiUserProfileSearch({
    dslSearch: canonicalUserProfileSearch,
    legacySearch: canonicalUserProfileSearch,
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
    mobileBinding: userMobileBinding,
    passwordHelper: userPasswordHelper,
    sessionRevocation: {
      revokeUserSessions: async ({ reason, onlySubjectAccessTransitionId, subjectIdentifier }) =>
        await sessionRevocation.revokeUserSessions(
          {
            subjectId: subjectIdentifier,
          },
          reason,
          { onlySubjectAccessTransitionId },
        ),
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
      auditLogWriter: tx.auditLogWriter,
      userRepository: tx.repositories.user,
      organizationRepository: tx.repositories.organization,
      privilegeRepository: tx.repositories.privilege,
      privilegeDelegationRepository: tx.repositories.privilegeDelegation,
    })),
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

  const services = {
    accountRecovery: accountRecoveryService,
    cap: capService,
    client: clientService,
    subjectAccessOperations,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    loginRestriction,
    mobile: mobileService,
    organization: organizationService,
    privilegeDelegation: privilegeDelegationService,
    subjectAccess,
    subjectAccessLifecycle,
    user: userService,
    userDelegationQuery,
    userPassword: userPasswordHelper,
    userProfileQuery,
    userProfileSearch,
    internalUserProfileQuery,
  };
  const authentication = createRootAuthenticationComposition({
    kernel: sessionKernel,
    barrier: subjectAccess,
    authentication: { auditLogWriter, runtime, services },
    clients: clientSnapshots.client,
    subjectFacts,
    loginCredentialParser,
    internalClients: clientService,
    internalAuthzLogger: runtime.logger,
    logger: runtime.logger,
    endpoints: {
      logger: runtime.logger,
      config: {
        authorizationEndpoint: runtime.config.env.sso.authorizationEndpoint,
        logoutEndpoint: runtime.config.env.sso.logoutEndpoint,
        thirdPartyOAEndpoint: runtime.config.env.sso.thirdPartyOAEndpoint,
        ssoExternalOrigin: runtime.config.env.sso.externalOrigin,
        ssoInternalOrigin: runtime.config.env.sso.internalOrigin,
      },
    },
    publicServices: { organizationService, userService, userProfileSearch },
    config: {
      ...runtime.config.auth,
      loginEndpoint: runtime.config.env.sso.loginEndpoint,
      projectionRetryAfterSeconds: runtime.config.env.sso.projectionRetryAfterSeconds,
    },
    customSso: {
      redis: runtime.redis,
      namespace: runtime.config.sessionKernel.namespace,
      codeTtlSeconds: runtime.config.auth.authCodeExpireSeconds,
      continuationTtlSeconds: runtime.config.auth.authCodeExpireSeconds,
    },
    customSsoAccess: {
      credentials,
      tokenTtlSeconds: runtime.config.auth.redisExpireSeconds,
      business: { audit: auditLogWriter, logger: runtime.logger },
      managed: {
        orcas: runtime.integrations.orcas,
        users: userService,
        audit: auditLogWriter,
        logger: runtime.logger,
      },
    },
    oidc: {
      redis: runtime.redis,
      namespace: runtime.config.oidc.namespace,
      issuers: {
        internal: `${runtime.config.env.sso.internalOrigin}/oidc`,
        external: `${runtime.config.env.sso.externalOrigin}/oidc`,
      },
      secureCookies: runtime.config.oidc.cookieSecure,
      codeTtlSeconds: runtime.config.oidc.authorizationCodeTtlSeconds,
      continuationTtlSeconds: runtime.config.oidc.continuationTtlSeconds,
    },
    oidcTokens: {
      credentials,
      signing: runtime.oidcSigning,
      tokenTtlSeconds: runtime.config.oidc.tokenTtlSeconds,
    },
    oidcClientAuth: createOidcClientAuthRateLimiter({
      redis: runtime.redis,
      namespace: runtime.config.oidc.namespace,
    }),
    oidcTrustProxy: runtime.config.oidc.trustProxy,
    oidcLogout: {
      verification: runtime.oidcSigning,
      confirmationTtlSeconds: runtime.config.oidc.logoutConfirmationTtlSeconds,
    },
  });
  return { ...services, authentication, sessionKernel, clientSnapshots };
}

export type ApiServices = ReturnType<typeof createApiServices>;
