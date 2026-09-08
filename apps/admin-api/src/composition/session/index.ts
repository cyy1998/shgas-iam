import type { SessionKernelRedis } from "@iam/session-kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import { createAdminSessionRevocationLogger } from "@admin-api/services/session-revocation/session-revocation.logger";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createLoginRestriction,
  createRedisLoginRestrictionStore,
} from "@iam/api-core/login-restriction";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
} from "@iam/api-core/subject-access";
import db from "@iam/db";
import { createSessionKernel } from "@iam/session-kernel";
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
  const revocationLogger = createAdminSessionRevocationLogger({ logger: options.runtime.logger });
  const sessionKernel = createSessionKernel({
    redis: options.runtime.redis as SessionKernelRedis,
    config: {
      ...options.runtime.config.sessionKernel,
      clock: options.runtime.clock,
    },
    logger: options.runtime.logger,
    sourceApp: LoggerSourceApp.AdminApi,
  });
  const subjectAccessOperations = createSubjectAccessOperations({
    barrier: subjectAccess,
    revocation: createSubjectAccessSessionRevocation(sessionKernel),
  });
  const revocation = createAdminSessionRevocationPort({
    sessionKernel,
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
    subjectAccessOperations,
    loginRestriction,
    revocation,
    subjectAccess,
    subjectAccessLifecycle,
  };
}

export type AdminApiSession = ReturnType<typeof createAdminApiSession>;
