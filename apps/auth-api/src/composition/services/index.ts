import { createAccountRecoveryService } from "@auth-api/services/account-recovery/account-recovery.service";
import { createLoginCredentialParser } from "@auth-api/services/authentication/login-credential.parser";
import { createCapService } from "@auth-api/services/human-verification/cap.service";
import { createHumanRiskService } from "@auth-api/services/human-verification/human-risk.service";
import { createImageCaptchaService } from "@auth-api/services/human-verification/image-captcha.service";
import { createMobileService } from "@auth-api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@auth-api/services/mobile/mobile-code-cooldown";
import { createUserService } from "@auth-api/services/user/user.service";
import { createUserMobileBinding } from "@auth-api/services/user/user-mobile-binding.helper";
import { createUserPasswordHelper } from "@auth-api/services/user/user-password.helper";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import { createGenericClientCache } from "@iam/client-snapshot/generic-cache";
import type { DbClient } from "@iam/db";
import type { AuditLogWriter } from "@iam/db/audit";
import { createClientSnapshotRepository, createGenericClientRepository } from "@iam/db/client-snapshot";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user";
import { createUserDocumentQueryService } from "@iam/documents/user/query";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import { createSubjectFactsLoggerObservability } from "@iam/documents/user/subject-facts";
import { GenericClientRuntimeDtoSchema, toGenericClientRuntimeDto } from "@iam/domain/client";
import { createLoginRestriction } from "@iam/login-restriction";
import { createRedisLoginRestrictionStore } from "@iam/login-restriction/redis";
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
import type { AuthApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { createAuthApiUnitOfWork } from "../tx";

type ApiUnitOfWork = ReturnType<typeof createAuthApiUnitOfWork>;

export interface CreateAuthApiServicesOptions {
  runtime: ApiRuntimePorts;
  repositories: AuthApiRepositories;
  auditLogWriter: AuditLogWriter;
  unitOfWork: ApiUnitOfWork;
  db: DbClient;
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

export function createAuthApiServices(options: CreateAuthApiServicesOptions) {
  const { runtime, repositories, auditLogWriter, unitOfWork, db } = options;

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
  const clientService = createGenericClientCache({
    redis: runtime.redis,
    schema: GenericClientRuntimeDtoSchema,
    source: createGenericClientRepository(db, toGenericClientRuntimeDto),
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

  const imageCaptcha = createImageCaptchaService({
    redis: runtime.redis,
    clock: runtime.clock,
    enabled: runtime.config.cap.enabled && runtime.config.humanVerification.imageCaptchaEnabled,
    secret: runtime.config.cap.secret,
  });
  const capService = createCapService({
    capClient: runtime.integrations.cap,
    imageCaptcha,
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
  const userMobileBinding = createUserMobileBinding({
    userRepository: repositories.user,
    mobileService,
    auditLogWriter,
  });

  const userPasswordHelper = createUserPasswordHelper({
    passwordHasher: runtime.passwordHasher,
  });

  const userService = createUserService({
    userRepository: repositories.user,
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
    imageCaptcha,
    client: clientService,
    subjectAccessOperations,
    humanRisk: humanRiskService,
    loginCredential: loginCredentialParser,
    loginRestriction,
    mobile: mobileService,
    subjectAccess,
    subjectAccessLifecycle,
    user: userService,
    userPassword: userPasswordHelper,
    userDocumentQuery,
  };
  return {
    ...services,
    sessionKernel,
    clientSnapshots,
    subjectFacts,
    credentials,
  };
}

export type ApiServices = ReturnType<typeof createAuthApiServices>;
