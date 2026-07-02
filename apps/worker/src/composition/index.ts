import type { WorkerEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";
import db, { closeDb } from "@iam/db";
import { createUserProfileWorkerModule } from "@iam/user-profile-read-model/worker";
import { createWorkerHttpApp, startWorkerHttpServer } from "@worker/http/server";
import {
  closeWorkerModules,
  resolveModuleKeys,
  selectModules,
  selectQueueRegistrations,
  startWorkerModules,
} from "@worker/modules/registry";
import { sql } from "drizzle-orm";
import { createWorkerRuntime } from "./runtime";

export interface CreateWorkerCompositionOptions {
  env: WorkerEnv;
  logger: WorkerLogger;
}

export async function createWorkerComposition(options: CreateWorkerCompositionOptions) {
  const runtime = createWorkerRuntime({ env: options.env, logger: options.logger });
  const userProfileModule = createUserProfileWorkerModule({
    db,
    redis: runtime.config.redis,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.userProfile,
  });
  const knownModules = [userProfileModule];
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
    userProfile: userProfileModule,
    shutdown,
  };
}

export type WorkerComposition = Awaited<ReturnType<typeof createWorkerComposition>>;
