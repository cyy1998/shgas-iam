import type { UserProfilePostgresReadinessCommandEnv, WorkerEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";
import {
  createSubjectAccessRepair,
  createSubjectAccessTransitionRecovery,
} from "@iam/api-core/subject-access";
import db, { closeDb } from "@iam/db";
import { createSubjectFactsRedisPublisher } from "@iam/user-profile-read-model";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/user-profile-read-model/subject-access-transition";
import {
  createCurrentUserProfilePostgresReadiness,
  createCurrentUserProfileRedisAccessReadiness,
  createEmploymentRepository,
  createEmploymentVerifier,
  createSubjectAccessAuthorityRepository,
  createUserProfileWorkerModule,
} from "@iam/user-profile-read-model/worker";
import { createWorkerHttpApp, startWorkerHttpServer } from "@worker/http/server";
import {
  closeWorkerModules,
  resolveModuleKeys,
  selectModules,
  selectQueueRegistrations,
  startWorkerModules,
} from "@worker/modules/registry";
import { sql } from "drizzle-orm";
import { closeWorkerCommandResources } from "./command-shutdown";
import { createWorkerRuntime } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

const COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS = 1;

export interface CreateWorkerCompositionOptions {
  env: WorkerEnv;
  logger: WorkerLogger;
  commandOnly?: boolean;
}

function createWorkerSubjectAccessRepair(runtime: ReturnType<typeof createWorkerRuntime>) {
  const {
    barrier: subjectAccessBarrier,
    bootstrap: subjectAccessBootstrap,
    store: subjectAccessStore,
  } = createWorkerSubjectAccess(runtime);
  const subjectAccessAuthority = createSubjectAccessAuthorityRepository({
    db,
    subjectFactsPublisher: createSubjectFactsRedisPublisher(runtime.redis),
  });
  const subjectAccessRepair = createSubjectAccessRepair({
    authority: subjectAccessAuthority,
    backlog: subjectAccessStore,
    barrier: subjectAccessBarrier,
    logger: runtime.logger,
  });
  const subjectAccessTransitionRecovery = createSubjectAccessTransitionRecovery({
    authority: createSubjectAccessTransitionRecoveryAuthority({
      transaction: async callback =>
        await db.transaction(async tx => await callback(tx)),
    }),
    backlog: subjectAccessStore,
    logger: runtime.logger,
  });
  const subjectAccessTransitionReaper
    = createSubjectAccessTransitionRepository(db);
  const repairBacklog: Pick<
    typeof subjectAccessStore,
    "inspectRepairBacklog"
  > = subjectAccessStore;
  return {
    barrier: subjectAccessBarrier,
    bootstrap: subjectAccessBootstrap,
    repair: subjectAccessRepair,
    repairBacklog,
    transitionReaper: subjectAccessTransitionReaper,
    transitionRecovery: subjectAccessTransitionRecovery,
  };
}

export async function createWorkerComposition(options: CreateWorkerCompositionOptions) {
  const commandOnly = options.commandOnly ?? false;
  const runtime = createWorkerRuntime({ env: options.env, logger: options.logger });
  const subjectAccess = createWorkerSubjectAccessRepair(runtime);
  const userProfileModule = createUserProfileWorkerModule({
    db,
    redis: runtime.config.redis,
    subjectFactsRedis: runtime.redis,
    subjectAccessRepair: subjectAccess.repair,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.userProfile,
  });
  const knownModules = [userProfileModule];
  const enabledModuleKeys = resolveModuleKeys(options.env.modules.enabled, knownModules);
  const enabledModules = selectModules(options.env.modules.enabled, knownModules);
  const dashboardQueues = commandOnly ? [] : selectQueueRegistrations(options.env.dashboard.queues, knownModules);
  if (!commandOnly) {
    await startWorkerModules(enabledModules);
  }

  const httpApp = commandOnly
    ? undefined
    : createWorkerHttpApp({
        env: options.env,
        redis: runtime.redis,
        healthState: {
          enabledModules: enabledModuleKeys,
          dashboardOnly: enabledModuleKeys.length === 0 && options.env.dashboard.enabled,
          modulesStarted: true,
        },
        dashboardQueues,
        checkHealth: async () => {
          try {
            await Promise.all([
              runtime.redis.ping(),
              db.execute(sql`select 1`),
            ]);
            return {
              ready: true,
              dependencies: {
                db: "ok" as const,
                redis: "ok" as const,
              },
            };
          }
          catch (error) {
            return {
              ready: false,
              dependencies: {
                db: "error" as const,
                redis: "error" as const,
              },
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      });
  const httpServer = !commandOnly && options.env.http.enabled
    ? startWorkerHttpServer(httpApp!, options.env.http.port)
    : undefined;

  async function shutdown(signal: string) {
    runtime.logger.info({ signal, enabledModules: enabledModuleKeys }, "worker shutting down");
    await Promise.allSettled([
      closeWorkerModules(knownModules),
      Promise.resolve(httpServer?.stop(true)),
      runtime.redis.quit(),
      closeDb(commandOnly
        ? { timeoutSeconds: COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS }
        : undefined),
    ]);
  }

  return {
    env: options.env,
    logger: runtime.logger,
    runtime,
    knownModules,
    enabledModules,
    dashboardQueues,
    httpApp,
    httpServer,
    userProfile: userProfileModule,
    subjectAccess: {
      barrier: subjectAccess.barrier,
      repair: subjectAccess.repair,
      repairBacklog: subjectAccess.repairBacklog,
      transitionReaper: subjectAccess.transitionReaper,
      transitionRecovery: subjectAccess.transitionRecovery,
    },
    shutdown,
  };
}

export type WorkerComposition = Awaited<ReturnType<typeof createWorkerComposition>>;

export async function createWorkerCommandComposition(options: Omit<CreateWorkerCompositionOptions, "commandOnly">) {
  return await createWorkerComposition({ ...options, commandOnly: true });
}

export async function createWorkerSubjectAccessRepairComposition(
  options: Omit<CreateWorkerCompositionOptions, "commandOnly">,
) {
  const runtime = createWorkerRuntime({
    env: options.env,
    logger: options.logger,
  });
  const subjectAccess = createWorkerSubjectAccessRepair(runtime);

  async function shutdown(signal: string) {
    runtime.logger.info({ signal }, "worker Subject Access repair shutting down");
    await Promise.allSettled([
      runtime.redis.quit(),
      closeDb(),
    ]);
  }

  return {
    env: options.env,
    logger: runtime.logger,
    runtime,
    subjectAccess,
    shutdown,
  };
}

export function createEmploymentCommandComposition(options: {
  logger: WorkerLogger;
}) {
  return {
    logger: options.logger,
    employment: {
      verifier: createEmploymentVerifier({
        inventory: createEmploymentRepository(db),
        clock: { nowDate: () => new Date() },
      }),
    },
    async shutdown() {
      await closeDb({ timeoutSeconds: COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS });
    },
  };
}

export function createUserProfilePostgresReadinessCommandComposition(
  options: {
    env: UserProfilePostgresReadinessCommandEnv;
    logger: WorkerLogger;
  },
) {
  const postgresGate = createCurrentUserProfilePostgresReadiness({
    db,
    clock: { nowDate: () => new Date() },
    config: {
      buildBatchSize: options.env.userProfile.rebuildBatchSize,
    },
  });

  async function shutdown(signal: string) {
    options.logger.info({ signal }, "User Profile PostgreSQL readiness command shutting down");
    await closeWorkerCommandResources([
      closeDb({ timeoutSeconds: COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS }),
    ]);
  }

  return {
    env: options.env,
    logger: options.logger,
    postgresGate,
    shutdown,
  };
}

export function createUserProfileRedisReadinessCommandComposition(
  options: Omit<CreateWorkerCompositionOptions, "commandOnly">,
) {
  const runtime = createWorkerRuntime({
    env: options.env,
    logger: options.logger,
  });
  const subjectAccess = createWorkerSubjectAccess(runtime);
  const redisAccessGate = createCurrentUserProfileRedisAccessReadiness({
    db,
    subjectFactsRedis: runtime.redis,
    subjectAccessBootstrap: subjectAccess.bootstrap,
    clock: runtime.clock,
    config: {
      buildBatchSize: runtime.config.userProfile.rebuildBatchSize,
    },
  });

  async function shutdown(signal: string) {
    runtime.logger.info({ signal }, "User Profile Redis readiness command shutting down");
    await closeWorkerCommandResources([
      runtime.redis.quit(),
      closeDb({ timeoutSeconds: COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS }),
    ]);
  }

  return {
    env: options.env,
    logger: runtime.logger,
    runtime,
    redisAccessGate,
    shutdown,
  };
}
