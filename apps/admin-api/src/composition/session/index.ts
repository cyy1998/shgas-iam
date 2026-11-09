import db from "@iam/db";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
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
import type { AdminApiRuntimePorts } from "../runtime";
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
    run: (callback) => subjectAccessOperations.run(callback),
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
