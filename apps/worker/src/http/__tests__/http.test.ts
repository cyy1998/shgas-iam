import { describe, expect, test } from "bun:test";
import type { WorkerEnv } from "@worker/env";
import { createWorkerHttpApp } from "@worker/http/server";

function fakeBullMqQueue() {
  return {
    name: "user-document",
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
    modules: { enabled: { mode: "list", keys: ["user-document"] } },
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
    userDocument: {
      concurrency: 2,
      rebuildBatchSize: 100,
      repairStaleSeconds: 300,
      repair: { enabled: false, intervalMs: 60_000, limit: 500, deadlineMs: 30_000 },
    },
    organizationDocument: {
      concurrency: 2,
      repairStaleSeconds: 300,
      repair: { enabled: false, intervalMs: 60_000, limit: 500, deadlineMs: 30_000 },
    },
    ...overrides,
  };
}

function createDashboardHttpApp() {
  return createWorkerHttpApp({
    env: env({ dashboard: { ...env().dashboard, enabled: true } }),
    healthState: {
      enabledModules: [],
      dashboardOnly: true,
      modulesStarted: true,
    },
    dashboardQueues: [{ moduleKey: "user-document", queueName: "user-document", queue: fakeBullMqQueue() }],
    checkHealth: async () => ({
      ready: true,
      dependencies: { db: "skipped" as const, redis: "ok" as const },
    }),
  });
}

describe("worker HTTP app", () => {
  test("reports ready health with enabled modules and dashboard-only state", async () => {
    const app = createWorkerHttpApp({
      env: env(),
      healthState: {
        enabledModules: ["user-document"],
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
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      enabledModules: ["user-document"],
      dashboardOnly: false,
      dependencies: { redis: "ok" },
    });
  });

  test("requires Basic Auth for dashboard routes", async () => {
    const app = createDashboardHttpApp();

    const response = await app.request("/admin/queues");
    expect(response.status).toBe(401);
  });

  test("serves the Bull Board dashboard through the Hono adapter", async () => {
    const app = createDashboardHttpApp();

    const response = await app.request("/admin/queues", {
      headers: { Authorization: `Basic ${btoa("ops:secret")}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
