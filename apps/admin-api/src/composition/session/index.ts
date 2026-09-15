import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { AdminApiRuntimePorts } from "../runtime";
import { createLoginRestriction, createRedisLoginRestrictionStore } from "@iam/api-core/login-restriction";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
} from "@iam/api-core/subject-access";
import db from "@iam/db";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { createUnifiedAdminLifecycleRevocation } from "./unified-lifecycle";

export interface CreateAdminApiSessionOptions {
  runtime: AdminApiRuntimePorts;
}

function createAdminApiSubjectAccess(runtime: Pick<AdminApiRuntimePorts, "clock" | "random" | "redis">) {
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
  const sessionKernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis: options.runtime.redis,
    ...options.runtime.config.sessionKernel,
    assertOperationActive: requireSubjectAccessOperation,
  });
  let subjectAccessOperations: ReturnType<typeof createSubjectAccessOperations>;
  const unifiedRevocation = createUnifiedSubjectAccessSessionRevocation(sessionKernel, {
    run: callback => subjectAccessOperations.run(callback),
  });
  subjectAccessOperations = createSubjectAccessOperations({
    barrier: subjectAccess,
    revocation: unifiedRevocation,
  });
  const revocation = createUnifiedAdminLifecycleRevocation(unifiedRevocation, options.runtime.logger);
  const subjectAccessLifecycle = createSubjectAccessLifecycle({
    barrier: subjectAccess,
    logger: options.runtime.logger,
    random: options.runtime.random,
    transitionIntent: createSubjectAccessTransitionRepository(db),
  });

  return {
    kernel: sessionKernel,
    unifiedRevocation,
    subjectAccessOperations,
    loginRestriction,
    revocation,
    subjectAccess,
    subjectAccessLifecycle,
  };
}

export type AdminApiSession = ReturnType<typeof createAdminApiSession>;
