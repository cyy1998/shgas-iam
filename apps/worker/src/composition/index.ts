import type { WorkerEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";
import { randomBytes } from "node:crypto";
import { hashSecret } from "@iam/api-core/security";
import {
  createSubjectAccessRepair,
  createSubjectAccessTransitionRecovery,
} from "@iam/api-core/subject-access";
import db, { closeDb } from "@iam/db";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/user-profile-read-model/subject-access-transition";
import {
  createSubjectAccessAuthorityRepository,
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
  createSubjectProjectionCutoverRepository,
  createSubjectProjectionCutoverVerifier,
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
import { createSubjectProjectionClientCutover } from "../commands/subject-projection-client-cutover";
import { createSubjectProjectionClientCutoverRepository } from "../commands/subject-projection-client-cutover.repository";
import { createWorkerRuntime } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

const CUTOVER_SECRET_HASH_COST = 12;
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
  const subjectProjectionClients = createSubjectProjectionClientCutover({
    clients: createSubjectProjectionClientCutoverRepository(db),
    secrets: {
      generate: () => `iam_sso_${randomBytes(32).toString("base64url")}`,
      hash: async secret => await hashSecret(secret, CUTOVER_SECRET_HASH_COST),
    },
  });
  const subjectProjectionVerifier = createSubjectProjectionCutoverVerifier({
    projection: createSubjectProjectionCutoverRepository(db),
    subjectFacts: createSubjectFactsRedisInspector(runtime.redis),
    subjectAccess: subjectAccess.bootstrap,
    clients: subjectProjectionClients,
    clock: runtime.clock,
  });
  const userProfileModule = createUserProfileWorkerModule({
    db,
    redis: runtime.config.redis,
    subjectFactsRedis: runtime.redis,
    subjectAccessRepair: subjectAccess.repair,
    subjectAccessBootstrap: subjectAccess.bootstrap,
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
    subjectProjectionCutover: {
      clients: subjectProjectionClients,
      verifier: subjectProjectionVerifier,
    },
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
