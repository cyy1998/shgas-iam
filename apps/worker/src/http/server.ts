import type { WorkerEnv } from "@worker/env";
import type { WorkerQueueRegistration } from "@worker/modules/registry";
import type { Hono } from "hono";
import type Redis from "ioredis";
import { OK, SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { Hono as HonoApp } from "hono";
import { basicAuth } from "hono/basic-auth";
import { createDashboardPlugin } from "./dashboard";

export interface WorkerHealthState {
  enabledModules: string[];
  dashboardOnly: boolean;
  modulesStarted: boolean;
}

export interface WorkerHealthCheckResult {
  ready: boolean;
  dependencies: {
    db: "ok" | "error" | "skipped";
    redis: "ok" | "error" | "skipped";
  };
  error?: string;
}

export interface CreateWorkerHttpAppInput {
  env: WorkerEnv;
  redis?: Pick<Redis, "ping">;
  healthState: WorkerHealthState;
  dashboardQueues: WorkerQueueRegistration[];
  checkHealth?: () => Promise<WorkerHealthCheckResult>;
}

export function createWorkerHttpApp(input: CreateWorkerHttpAppInput): Hono {
  const app = new HonoApp();
  const checkHealth = input.checkHealth ?? (() => checkWorkerHealth(input.redis));

  app.get(input.env.http.healthPath, async (c) => {
    const health = await checkHealth();
    const ready = health.ready && input.healthState.modulesStarted;
    return c.json({
      ok: ready,
      enabledModules: input.healthState.enabledModules,
      dashboardOnly: input.healthState.dashboardOnly,
      dashboardEnabled: input.env.dashboard.enabled,
      modulesStarted: input.healthState.modulesStarted,
      dependencies: health.dependencies,
      error: health.error,
    }, ready ? OK : SERVICE_UNAVAILABLE);
  });

  if (input.env.dashboard.enabled) {
    if (input.env.dashboard.authEnabled) {
      app.use(
        `${input.env.dashboard.path}/*`,
        basicAuth({
          username: input.env.dashboard.username ?? "",
          password: input.env.dashboard.password ?? "",
        }),
      );
      app.use(
        input.env.dashboard.path,
        basicAuth({
          username: input.env.dashboard.username ?? "",
          password: input.env.dashboard.password ?? "",
        }),
      );
    }
    app.route(input.env.dashboard.path, createDashboardPlugin({
      env: input.env,
      queues: input.dashboardQueues,
    }));
  }

  return app;
}

export function startWorkerHttpServer(app: Hono, port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}

async function checkWorkerHealth(redis?: Pick<Redis, "ping">): Promise<WorkerHealthCheckResult> {
  try {
    if (redis !== undefined) {
      await redis.ping();
    }
    return {
      ready: true,
      dependencies: {
        db: "skipped",
        redis: redis === undefined ? "skipped" : "ok",
      },
    };
  }
  catch (error) {
    return {
      ready: false,
      dependencies: {
        db: "skipped",
        redis: "error",
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
