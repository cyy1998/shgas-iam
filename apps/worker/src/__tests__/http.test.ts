import type { WorkerEnv } from "../env";
import { describe, expect, test } from "bun:test";
import { createDashboardQueueAdapters } from "../http/dashboard";
import { createWorkerHttpApp } from "../http/server";

function fakeBullMqQueue() {
  return {
    name: "user-profile",
    metaValues: {
      version: "bullmq-test",
    },
  };
}

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    databaseUrl: "postgresql://iam:password@localhost/iam",
    redis: { host: "localhost", port: 6379, db: 0 },
    nodeEnv: "test",
    log: { level: "info", format: "json" },
    modules: { enabled: { mode: "list", keys: ["user-profile"] } },
    http: { enabled: true, port: 30003, healthPath: "/healthz" },
    dashboard: {
      enabled: false,
      path: "/admin/queues",
      queues: { mode: "all", keys: [] },
      authEnabled: true,
      username: "ops",
      password: "secret",
      readOnly: true,
    },
    userProfile: { concurrency: 2, rebuildBatchSize: 100, backfillBatchSize: 500, repairStaleSeconds: 300 },
    ...overrides,
  };
}

describe("worker HTTP app", () => {
  test("reports ready health with enabled modules and dashboard-only state", async () => {
    const app = createWorkerHttpApp({
      env: env(),
      healthState: {
        enabledModules: ["user-profile"],
        dashboardOnly: false,
        modulesStarted: true,
      },
      dashboardQueues: [],
      checkHealth: async () => ({
        ready: true,
        dependencies: { db: "skipped", redis: "ok" },
      }),
    });

    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      enabledModules: ["user-profile"],
      dashboardOnly: false,
      dependencies: { redis: "ok" },
    });
  });

  test("requires Basic Auth for dashboard routes", async () => {
    const app = createWorkerHttpApp({
      env: env({ dashboard: { ...env().dashboard, enabled: true } }),
      healthState: {
        enabledModules: [],
        dashboardOnly: true,
        modulesStarted: true,
      },
      dashboardQueues: [{ moduleKey: "user-profile", queueName: "user-profile", queue: fakeBullMqQueue() }],
      checkHealth: async () => ({
        ready: true,
        dependencies: { db: "skipped", redis: "ok" },
      }),
    });

    const response = await app.request("/admin/queues");
    expect(response.status).toBe(401);
  });

  test("configures dashboard queue adapters as read-only by default", () => {
    const [adapter] = createDashboardQueueAdapters({
      env: env(),
      queues: [{ moduleKey: "user-profile", queueName: "user-profile", queue: fakeBullMqQueue() }],
    });

    expect(adapter?.readOnlyMode).toBe(true);

    const [writeAdapter] = createDashboardQueueAdapters({
      env: env({ dashboard: { ...env().dashboard, readOnly: false } }),
      queues: [{ moduleKey: "user-profile", queueName: "user-profile", queue: fakeBullMqQueue() }],
    });

    expect(writeAdapter?.readOnlyMode).toBe(false);
  });
});
