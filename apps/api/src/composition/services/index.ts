import { createAccountRecoveryService } from "@api/services/account-recovery/account-recovery.service";
import { createAuditRepository } from "@api/services/audit/audit.repository";
import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { createClientService } from "@api/services/client/client.service";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import { createOrganizationService } from "@api/services/organization/organization.service";
import { createUserService } from "@api/services/user/user.service";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserDocumentSearchAdapter } from "@api/services/user-document-search/user-document-search.adapter";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import type { DbClient } from "@iam/db";
import db from "@iam/db";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { createDelegationService } from "@iam/delegation";
import { createLoginRestriction } from "@iam/login-restriction";
import { createRedisLoginRestrictionStore } from "@iam/login-restriction/redis";
import { createOidcClientAuthRateLimiter } from "@iam/oidc";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/organization-document";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  createSubjectAccessBarrier,
  createSubjectAccessOperations,
  requireSubjectAccessOperation,
} from "@iam/subject-access";
import { createSubjectAccessLifecycle } from "@iam/subject-access/lifecycle";
import { createRedisSubjectAccessStore } from "@iam/subject-access/redis";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";
import { mapUnitOfWork } from "@iam/unit-of-work";
import {
  createInternalUserDocumentQueryRepository,
  createInternalUserDocumentQueryService,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-document";
import {
  createUserDocumentQueryService,
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
} from "@iam/user-document/query";
import { createSubjectAccessTransitionRepository } from "@iam/user-document/subject-access-transition";
import { createSubjectFactsLoggerObservability } from "@iam/user-document/subject-facts";
import { createPublicDelegationDependencies } from "../public-delegation";
import type { ApiRepositories } from "../repositories";
import { createRootAuthenticationComposition } from "../root-authentication";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiServicesOptions {
  runtime: ApiRuntimePorts;
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  unitOfWork: ApiUnitOfWork;
  userDocumentQueryDb: DbClient;
  organizationQueryDb: DbClient;
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
    run: (callback) => subjectAccessOperations.run(callback),
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

  const userDocumentQuery = createUserDocumentQueryService({
    documentRepository: repositories.userDocument,
  });
  const internalUserDocumentQuery = createInternalUserDocumentQueryService({
    documentRepository: createInternalUserDocumentQueryRepository(options.userDocumentQueryDb),
  });
  const userDocumentSearch = createUserDocumentSearchAdapter(
    createUserDocumentSearchService({
      documentRepository: createUserDocumentSearchRepository(options.userDocumentQueryDb),
    }),
  );
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
    documentQuery: userDocumentQuery,
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
    uow: mapUnitOfWork(unitOfWork, (tx) => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
      subjectAccessMutation: tx.subjectAccessMutation,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });

  const accountRecoveryService = createAccountRecoveryService({
    userLookup: userService,
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(unitOfWork, (tx) => ({
      organizationRepository: tx.repositories.organization,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userDocumentInvalidation: tx.userDocumentInvalidation,
      organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
    })),
  });

  const organizationDocument = createOrganizationDocumentQueryService({
    repository: createOrganizationDocumentQueryRepository(options.organizationQueryDb),
  });

  const delegationService = createDelegationService({
    db,
    recordAudit: async (tx, event) =>
      createApiAuditLogWriter({ auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
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
    organizationDocument,
    delegation: delegationService,
    subjectAccess,
    subjectAccessLifecycle,
    user: userService,
    userPassword: userPasswordHelper,
    userDocumentQuery,
    userDocumentSearch,
    internalUserDocumentQuery,
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
    publicServices: { userService },
    publicDelegation: createPublicDelegationDependencies(db, delegationService),
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
