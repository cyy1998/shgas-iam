import db, { closeDb } from "@iam/db";
import { createOrganizationDocumentWorkerModule } from "@iam/documents/organization/worker";
import { createSubjectFactsRedisPublisher } from "@iam/documents/user";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/documents/user/subject-access-transition";
import { createSubjectAccessAuthorityRepository, createUserDocumentWorkerModule } from "@iam/documents/user/worker";
import { createSubjectAccessRepair, createSubjectAccessTransitionRecovery } from "@iam/subject-access/recovery";
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
import { startDocumentRepairSchedule } from "./document-repair-schedule";
import type { WorkerLogger } from "./runtime";
import { createWorkerRuntime } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

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
    config: { ...runtime.config.userDocument, backfillBatchSize: options.env.userDocument.repair.limit },
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
  const repairSchedules = (["user", "organization"] as const).map((document) =>
    startDocumentRepairSchedule({ document, env: options.env, enabledModuleKeys, logger: runtime.logger }),
  );

  let closing: Promise<void> | undefined;
  function shutdown(signal: string) {
    closing ??= (async () => {
      runtime.logger.info({ signal, enabledModules: enabledModuleKeys }, "worker shutting down");
      try {
        const results = await Promise.allSettled(repairSchedules.map((schedule) => schedule.close()));
        const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
        if (failures.length) throw new AggregateError(failures, "Document repair schedules failed to close");
      } finally {
        await Promise.allSettled([
          closeWorkerModules(knownModules),
          Promise.resolve(httpServer?.stop(true)),
          runtime.redis.quit(),
          closeDb(),
        ]);
      }
    })();
    return closing;
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
