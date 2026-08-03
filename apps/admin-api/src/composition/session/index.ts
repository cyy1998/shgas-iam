import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import { createAdminSessionRevocationLogger } from "@admin-api/services/session-revocation/session-revocation.logger";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
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
import db from "@iam/db";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";

export interface CreateAdminApiSessionOptions {
  runtime: AdminApiRuntimePorts;
}

function createAdminApiSubjectAccess(
  runtime: Pick<AdminApiRuntimePorts, "clock" | "random" | "redis">,
) {
  return createSubjectAccessBarrier({
    clock: runtime.clock,
    random: runtime.random,
    store: createRedisSubjectAccessStore({
      redis: runtime.redis,
    }),
  });
}

export function createAdminApiSession(options: CreateAdminApiSessionOptions) {
  const loginRestriction = createLoginRestriction({
    clock: options.runtime.clock,
    random: options.runtime.random,
    store: createRedisLoginRestrictionStore({
      redis: options.runtime.redis,
    }),
  });
  const subjectAccess = createAdminApiSubjectAccess(options.runtime);
  const subjectAccessPrincipal = createSubjectAccessPrincipalValidator(subjectAccess);
  const sessionKernel = createSessionKernel({
    redis: options.runtime.redis as SessionKernelRedis,
    config: {
      ...options.runtime.config.sessionKernel,
      clock: options.runtime.clock,
    },
    principalAccessFence: subjectAccessPrincipal,
    logger: options.runtime.logger,
    sourceApp: LoggerSourceApp.AdminApi,
  });
  const revocationLogger = createAdminSessionRevocationLogger({ logger: options.runtime.logger });
  const revocation = createAdminSessionRevocationPort({
    sessionKernel,
    oidcInvalidation: options.runtime.integrations.oidcInvalidation,
    logger: revocationLogger,
  });
  const subjectAccessLifecycle = createSubjectAccessLifecycle({
    barrier: subjectAccess,
    logger: options.runtime.logger,
    random: options.runtime.random,
    transitionIntent: createSubjectAccessTransitionRepository(db),
  });

  return {
    kernel: sessionKernel,
    loginRestriction,
    revocation,
    subjectAccess,
    subjectAccessLifecycle,
  };
}

export type AdminApiSession = ReturnType<typeof createAdminApiSession>;
