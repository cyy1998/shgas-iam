import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
import type { SessionKernelRedis } from "@iam/session-kernel";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createApiUnitOfWork } from "../tx";
import { createAccountRecoveryService } from "@api/services/account-recovery/account-recovery.service";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { createPrincipalSessionAdapter } from "@api/services/authentication/principal-session.adapter";
import { createClientService } from "@api/services/client/client.service";
import {
  createCustomSsoClientRuntimeReader,
  createCustomSsoClientRuntimeSnapshotAdapter,
} from "@api/services/client/custom-sso-client-runtime.reader";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createOrganizationService } from "@api/services/organization/organization.service";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import {
  createCustomSsoSubjectDeliveryRequestScope,
} from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import { createV3UserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search-v3.adapter";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import { createUserService } from "@api/services/user/user.service";
import {
  createClientRuntimeSnapshotLoggerObservability,
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createLoginRestriction,
  createRedisLoginRestrictionStore,
} from "@iam/api-core/login-restriction";
import { verifySecret } from "@iam/api-core/security";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
} from "@iam/api-core/subject-access";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import db from "@iam/db";
import { createSessionKernel } from "@iam/session-kernel";
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
import {
  createV3UserProfileQueryRepository,
  createV3UserProfileQueryService,
} from "@iam/user-profile-read-model/v3";
import { createCustomSsoOperationAdapter } from "../custom-sso-operation.adapter";
import { createApiCustomSsoOperations } from "../custom-sso-operations";
import { createApiUserProfileSearch } from "./user-profile-search";

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
  const customSsoCleanup = createCustomSsoCleanup({
    redis: runtime.redis,
  });
  const sessionKernel = createSessionKernel({
    redis: runtime.redis as SessionKernelRedis,
    config: {
      ...runtime.config.sessionKernel,
      clock: runtime.clock,
    },
    cleanupAdapters: [
      customSsoCleanup,
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
  const subjectAccessOperations = createSubjectAccessOperations({
    barrier: subjectAccess,
    revocation: createSubjectAccessSessionRevocation(sessionKernel),
  });
  const principalSessions = createPrincipalSessionAdapter(sessionKernel, subjectAccessOperations);
  const subjectFacts = createSubjectFactsReader({
    db,
    cache: createSubjectFactsRedisCache(runtime.redis),
    observability: createSubjectFactsLoggerObservability(runtime.logger),
  });
  const clientService = createClientService({
    redis: runtime.redis,
    clientRepository: repositories.client,
  });
  const clientRuntimeSnapshots = createClientRuntimeSnapshotModule({
    redis: runtime.redis,
    adapters: [
      createCustomSsoClientRuntimeSnapshotAdapter({
        repository: repositories.customSsoClient,
      }),
      createClientTrafficGateSnapshotAdapter({
        source: repositories.client,
      }),
    ],
    createEpoch: runtime.random.uuid,
    observability: createClientRuntimeSnapshotLoggerObservability(
      runtime.logger,
    ),
  });
  const customSsoClientRuntime = createCustomSsoClientRuntimeReader(
    clientRuntimeSnapshots.reader("custom-sso"),
  );
  const clientTrafficGate = createClientTrafficGateReader(
    clientRuntimeSnapshots.reader("traffic-gate"),
  );
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
  const canonicalUserProfileSearch = createV3UserProfileSearchAdapter(
    createV3UserProfileQueryService({
      profileRepository: createV3UserProfileQueryRepository(
        options.userProfileQueryDb,
      ),
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
        await createSubjectAccessSessionRevocation(sessionKernel).revokeUserSessions({
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
      auditLogWriter: tx.auditLogWriter,
      userRepository: tx.repositories.user,
      organizationRepository: tx.repositories.organization,
      privilegeRepository: tx.repositories.privilege,
      privilegeDelegationRepository: tx.repositories.privilegeDelegation,
    })),
  });

  const customSsoOperations = createApiCustomSsoOperations({
    clientSecrets: repositories.customSsoClient,
    secrets: { verify: verifySecret },
    traffic: clientTrafficGate,
    clients: customSsoClientRuntime,
    kernel: sessionKernel,
    logger: runtime.logger,
    orcas: runtime.integrations.orcas,
    random: runtime.random,
    subjectFacts,
    authorizationFreshness: subjectFacts,
    permittedUsers: userService,
    auditLogWriter,
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

  return {
    accountRecovery: accountRecoveryService,
    cap: capService,
    client: clientService,
    customSso: createCustomSsoOperationAdapter({ customSsoOperations, subjectAccessOperations }),
    customSsoOperations,
    subjectAccessOperations,
    customSsoSubjectDeliveryRequests,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    loginRestriction,
    mobile: mobileService,
    organization: organizationService,
    principalSessions,
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
}

export type ApiServices = ReturnType<typeof createApiServices>;
