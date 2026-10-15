import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import type { WorkerEnv } from "@worker/env";
import { createWorkerHttpApp } from "@worker/http/server";
import Redis from "ioredis";
import { resetWorkerRedisTestDatabase, resolveWorkerRedisTestUrl } from "../support/redis-test-harness";

let stopExecutors: Array<() => Promise<void> | void>;
beforeEach(async () => {
  stopExecutors = [];
  const observer = new Redis(resolveWorkerRedisTestUrl(process.env), {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  try {
    await observer.connect();
    const remaining = await observer.dbsize();
    expect(remaining).toBe(0);
  } finally {
    observer.disconnect();
  }
});
afterEach(async () => {
  if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
});

function createFixture(readOnly = true) {
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
  const redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  const name = `test-${randomUUID()}`;
  const queue = createJobQueue<{ value: number }, number>({
    name,
    redis,
    defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 10 } },
  });
  let closePromise: Promise<void> | undefined;
  stopExecutors.push(() => {
    closePromise ??= queue.close();
    return closePromise;
  });
  const env: WorkerEnv = {
    databaseUrl: "postgresql://unused:unused@localhost/unused",
    redis,
    nodeEnv: "test",
    log: { level: "warn", format: "json" },
    modules: { enabled: { mode: "none", keys: [] } },
    http: { enabled: true, port: 30003, healthPath: "/healthz" },
    dashboard: {
      enabled: true,
      path: "/admin/queues",
      queues: { mode: "all", keys: [] },
      authEnabled: true,
      username: "test-ops",
      password: "test-password",
      readOnly,
    },
    userProfile: { concurrency: 1, rebuildBatchSize: 100, backfillBatchSize: 500, repairStaleSeconds: 300 },
    organizationSearch: { concurrency: 2, backfillBatchSize: 500 },
  };
  const app = createWorkerHttpApp({
    env,
    healthState: { enabledModules: [], dashboardOnly: true, modulesStarted: true },
    dashboardQueues: [{ moduleKey: "test", queueName: name, queue }],
  });
  return {
    name,
    redis,
    queue,
    app,
  };
}

test("bulk jobs retry transient failures, complete with results and close the consumer", async () => {
  const fixture = createFixture();
  const completed = Promise.withResolvers<void>();
  const results = new Map<number, number>();
  let worker: ReturnType<typeof createJobWorker<{ value: number }, number>> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = createJobWorker<{ value: number }, number>({
      name: fixture.name,
      redis: fixture.redis,
      concurrency: 1,
      processor: async (job) => {
        if (job.data.value === 2 && job.attemptsMade === 0) throw new Error("transient test failure");
        return job.data.value * 2;
      },
    });
    const currentWorker = worker;
    stopExecutors.push(() => currentWorker.close());
    worker.on("completed", (job, result) => {
      results.set(job.data.value, result);
      if (results.size === 2) completed.resolve();
    });
    worker.on("error", completed.reject);
    timeout = setTimeout(() => completed.reject(new Error("Queue completion timed out")), 8_000);
    const jobs = await fixture.queue.addBulk([
      { name: "double", data: { value: 1 } },
      { name: "double", data: { value: 2 } },
    ]);
    await completed.promise;
    expect(results).toEqual(
      new Map([
        [1, 2],
        [2, 4],
      ]),
    );
    const retriedId = jobs[1]?.id;
    if (!retriedId) throw new Error("Bulk enqueue did not return the second job ID");
    const retried = await fixture.queue.getJob(retriedId);
    expect(retried?.attemptsMade).toBe(2);
    const counts = await fixture.queue.getJobCounts("completed", "failed");
    expect(counts).toMatchObject({ completed: 2, failed: 0 });
  } finally {
    clearTimeout(timeout);
  }
}, 10_000);

test("dashboard rejects unauthenticated queue reads", async () => {
  const fixture = createFixture();
  const denied = await fixture.app.request("/admin/queues/api/queues");
  expect(denied.status).toBe(401);
}, 10_000);

test("dashboard returns real queue state to an authenticated reader", async () => {
  const fixture = createFixture();
  const headers = { Authorization: `Basic ${btoa("test-ops:test-password")}` };
  await fixture.queue.add("double", { value: 3 });
  const response = await fixture.app.request("/admin/queues/api/queues", { headers });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    queues: expect.arrayContaining([
      expect.objectContaining({
        name: fixture.name,
        readOnlyMode: true,
        counts: expect.objectContaining({ waiting: 1 }),
      }),
    ]),
  });
}, 10_000);

test("dashboard rejects authenticated writes to a read-only queue", async () => {
  const fixture = createFixture();
  const headers = { Authorization: `Basic ${btoa("test-ops:test-password")}` };
  const write = await fixture.app.request(`/admin/queues/api/queues/${fixture.name}/pause`, {
    method: "PUT",
    headers,
  });
  expect(write.status).toBe(405);
  const paused = await fixture.queue.isPaused();
  expect(paused).toBe(false);
}, 10_000);

test("dashboard lets an authenticated operator pause a writable queue", async () => {
  const fixture = createFixture(false);
  const headers = { Authorization: `Basic ${btoa("test-ops:test-password")}` };
  const initiallyPaused = await fixture.queue.isPaused();
  expect(initiallyPaused).toBe(false);
  const write = await fixture.app.request(`/admin/queues/api/queues/${fixture.name}/pause`, {
    method: "PUT",
    headers,
  });
  expect(write.status).toBe(200);
  const paused = await fixture.queue.isPaused();
  expect(paused).toBe(true);
}, 10_000);
