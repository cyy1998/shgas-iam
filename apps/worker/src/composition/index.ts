import { createSubjectAccessRepair, createSubjectAccessTransitionRecovery } from "@iam/api-core/subject-access";
import db, { closeDb } from "@iam/db";
import { createOrganizationDocumentWorkerModule } from "@iam/organization-document/worker";
import { createSubjectFactsRedisPublisher } from "@iam/user-document";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/user-document/subject-access-transition";
import {
  createEmploymentRepository,
  createEmploymentVerifier,
  createSubjectAccessAuthorityRepository,
  createUserDocumentWorkerModule,
} from "@iam/user-document/worker";
import type { WorkerEnv } from "@worker/env";
import { createWorkerHttpApp, startWorkerHttpServer } from "@worker/http/server";
import {
  closeWorkerModules,
  resolveModuleKeys,
  selectModules,
  selectQueueRegistrations,
  startWorkerModules,
} from "@worker/modules/registry";
import { sql } from "drizzle-orm";
import type { WorkerLogger } from "./runtime";
import { createWorkerRuntime } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

const COMMAND_DB_SHUTDOWN_TIMEOUT_SECONDS = 1;

export interface CreateWorkerCompositionOptions {
  env: WorkerEnv;
  logger: WorkerLogger;
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
      transaction: async (callback) => await db.transaction(async (tx) => await callback(tx)),
    }),
    backlog: subjectAccessStore,
    logger: runtime.logger,
  });
  const subjectAccessTransitionReaper = createSubjectAccessTransitionRepository(db);
  const repairBacklog: Pick<typeof subjectAccessStore, "inspectRepairBacklog"> = subjectAccessStore;
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
  const runtime = createWorkerRuntime({ env: options.env, logger: options.logger });
  const subjectAccess = createWorkerSubjectAccessRepair(runtime);
  const userDocumentModule = createUserDocumentWorkerModule({
    db,
    redis: runtime.config.redis,
    subjectFactsRedis: runtime.redis,
    subjectAccessRepair: subjectAccess.repair,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.userDocument,
  });
  const organizationDocumentModule = createOrganizationDocumentWorkerModule({
    db,
    redis: runtime.config.redis,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.organizationDocument,
  });
  const knownModules = [userDocumentModule, organizationDocumentModule];
  const enabledModuleKeys = resolveModuleKeys(options.env.modules.enabled, knownModules);
  const enabledModules = selectModules(options.env.modules.enabled, knownModules);
  const dashboardQueues = selectQueueRegistrations(options.env.dashboard.queues, knownModules);
  await startWorkerModules(enabledModules);

  const httpApp = createWorkerHttpApp({
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
        await Promise.all([runtime.redis.ping(), db.execute(sql`select 1`)]);
        return {
          ready: true,
          dependencies: {
            db: "ok" as const,
            redis: "ok" as const,
          },
        };
      } catch (error) {
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
  const httpServer = options.env.http.enabled ? startWorkerHttpServer(httpApp, options.env.http.port) : undefined;

  async function shutdown(signal: string) {
    runtime.logger.info({ signal, enabledModules: enabledModuleKeys }, "worker shutting down");
    await Promise.allSettled([
      closeWorkerModules(knownModules),
      Promise.resolve(httpServer?.stop(true)),
      runtime.redis.quit(),
      closeDb(),
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
    userDocument: userDocumentModule,
    organizationDocument: organizationDocumentModule,
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

export function createEmploymentCommandComposition(options: { logger: WorkerLogger }) {
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
