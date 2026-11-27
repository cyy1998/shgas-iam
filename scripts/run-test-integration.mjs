#!/usr/bin/env node
import "./require-linux.mjs";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { formatResourceFailure, runOwnedCommand } from "./owned-command.mjs";
import {
  parseApisixAdminConfig,
  testApisixAdminKeyEnv,
  testApisixAdminUrlEnv,
  verifyApisixAdminBaseline,
} from "./test-resources/apisix-admin.mjs";
import {
  integrationRedisSlotLimit,
  parseBrowserWorkers,
  parseIntegrationArguments,
  parseIntegrationConcurrency,
  selectIntegrationTasks,
  testPostgresUrlEnv,
  testRedisUrlEnv,
} from "./test-resources/integration-selection.mjs";
import { preparePostgresTemplate } from "./test-resources/postgres-template.mjs";
import { formatRedisSlotUrl, verifyRedisDatabaseSlotSupport } from "./test-resources/redis-preflight.mjs";

const localEndpoints = {
  [testPostgresUrlEnv]: "postgresql://iam_test:iam_test@127.0.0.1:55432/iam_test",
  [testRedisUrlEnv]: "redis://127.0.0.1:56379/0",
  [testApisixAdminUrlEnv]: "http://127.0.0.1:59180/apisix/admin",
  [testApisixAdminKeyEnv]: "iam-gateway-integration-admin-key",
};

const taskPriority = [
  "@iam/auth-api:bun",
  "@iam/sso-api:bun",
  "@iam/integration-api:bun",
  "@iam/admin:playwright",
  "@iam/admin-api:bun",
  "@iam/ops:bun",
  "@iam/documents:bun",
  "@iam/worker:bun",
  "@iam/sso:playwright",
  "@iam/gateway-apisix:bun",
  "@iam/db:bun",
];
const priority = (task) => {
  const rank = taskPriority.indexOf(`${task.name}:${task.executor}`);
  return rank === -1 ? taskPriority.length : rank;
};

async function preflight(service, variables, check) {
  try {
    return await check();
  } catch (error) {
    throw new Error(
      `${service} test infrastructure is unavailable or invalid. Run pnpm test:infra:up locally or check ${variables}.`,
      { cause: error },
    );
  }
}

async function prepareTaskEnvironments(root, logDirectory, tasks, signal) {
  const endpoints = { ...localEndpoints };
  const environment = { ...process.env };
  for (const name of Object.keys(localEndpoints)) {
    endpoints[name] = environment[name]?.trim() ?? localEndpoints[name];
    delete environment[name];
  }
  delete environment.IAM_TEST_POSTGRES_TEMPLATE;

  const postgresUrl = endpoints[testPostgresUrlEnv];
  const redisUrl = endpoints[testRedisUrlEnv];
  let templateName;
  let apisix;
  if (tasks.some(({ resources }) => resources.postgres)) {
    templateName = await preflight("PostgreSQL", testPostgresUrlEnv, () =>
      preparePostgresTemplate({
        databaseUrl: postgresUrl,
        root,
        signal,
        logFile: join(logDirectory, "template-migration.log"),
      }),
    );
  }
  if (tasks.some(({ resources }) => resources.redis)) {
    await preflight("Redis", testRedisUrlEnv, () => verifyRedisDatabaseSlotSupport(redisUrl));
  }
  if (tasks.some(({ requiresApisix }) => requiresApisix)) {
    apisix = await preflight("APISIX", `${testApisixAdminUrlEnv} and ${testApisixAdminKeyEnv}`, async () => {
      const external =
        process.env[testApisixAdminUrlEnv] !== undefined || process.env[testApisixAdminKeyEnv] !== undefined;
      const config = parseApisixAdminConfig(external ? process.env : localEndpoints);
      await verifyApisixAdminBaseline(config, { signal, timeoutMs: 2000, requestTimeoutMs: 1000 });
      return config;
    });
  }

  let redisSlot = 0;
  return new Map(
    tasks.map((task) => [
      task,
      {
        ...environment,
        ...(task.resources.postgres && {
          [testPostgresUrlEnv]: postgresUrl,
          IAM_TEST_POSTGRES_TEMPLATE: templateName,
        }),
        ...(task.resources.redis && { [testRedisUrlEnv]: formatRedisSlotUrl(redisUrl, ++redisSlot) }),
        ...(task.requiresApisix && {
          [testApisixAdminUrlEnv]: apisix.adminUrl,
          [testApisixAdminKeyEnv]: apisix.adminKey,
        }),
      },
    ]),
  );
}

function executorCommand(task, cwd, browserWorkers) {
  if (task.executor === "bun")
    return {
      executable: "bun",
      args: ["--no-env-file", "test", "--max-concurrency=1", "--bail", ...task.files.map((file) => `./${file}`)],
    };
  if (task.executor === "vitest")
    return {
      executable: join(cwd, "node_modules/.bin/vitest"),
      args: ["run", "--maxWorkers=1", "--no-file-parallelism", "--bail=1", ...task.files],
    };
  const workers =
    Object.keys(task.resources).length === 0
      ? (browserWorkers ?? Math.min(4, Math.max(2, Math.floor(availableParallelism() / 2))))
      : 1;
  return {
    executable: process.execPath,
    args: [
      join(cwd, "node_modules/@playwright/test/cli.js"),
      "test",
      `--workers=${workers}`,
      "--max-failures=1",
      "--retries=0",
      ...task.files,
    ],
  };
}

async function executeTasks({ root, logDirectory, tasks, taskEnvironments, browserWorkers, options, controller }) {
  const outcomes = new Map();
  const canceledAfterFailure = new Error("Integration canceled after a task failed");
  const cancelRemaining = () => controller.abort(canceledAfterFailure);
  let next = 0;

  async function work() {
    while (!controller.signal.aborted && next < tasks.length) {
      const task = tasks[next++];
      const key = `${task.name}:${task.executor}`;
      const packageName = encodeURIComponent(task.name.replace(/^@iam\//u, ""));
      const logPath = join(logDirectory, `${packageName}-${task.executor}.log`);
      const start = performance.now();
      let status = "passed";
      let exitCode;
      let failure;
      try {
        const cwd = join(root, task.directory);
        const commandOptions = {
          cwd,
          env: taskEnvironments.get(task),
          signal: controller.signal,
          timeoutMs: options.timeoutMs,
          cleanupTimeoutMs: options.cleanupTimeoutMs,
          onExecutionFailure: cancelRemaining,
        };
        if (task.executor === "playwright") {
          const preflightPath = join(root, "scripts/playwright-e2e-preflight.mjs");
          const browser = await runOwnedCommand({
            ...commandOptions,
            executable: process.execPath,
            args: [preflightPath],
            fullLogFile: `${logPath}.preflight.log`,
          });
          if (browser.exitCode !== 0) throw new Error(browser.output);
        }
        const result = await runOwnedCommand({
          ...commandOptions,
          ...executorCommand(task, cwd, browserWorkers),
          fullLogFile: logPath,
        });
        if (result.exitCode !== 0) {
          exitCode = result.exitCode;
          throw new Error(`exited with code ${exitCode}`);
        }
      } catch (error) {
        if (error === controller.signal.reason) status = "canceled";
        else {
          status = "failed";
          failure = error;
        }
        cancelRemaining();
      }
      outcomes.set(key, { status, durationMs: Math.round(performance.now() - start), logPath, exitCode, failure });
    }
  }

  const concurrency = Math.min(tasks.length, options.concurrency);
  console.log(`[integration] Scheduling ${tasks.length} tasks with concurrency ${concurrency}`);
  await Promise.all(Array.from({ length: concurrency }, work));

  const failures = [];
  for (const task of tasks) {
    const key = `${task.name}:${task.executor}`;
    const outcome = outcomes.get(key);
    if (!outcome) continue;
    const { status, durationMs, logPath, exitCode, failure } = outcome;
    console.log(`[integration] ${key} ${status} in ${durationMs} ms; log ${logPath}`);
    if (status === "failed") {
      failures.push(new Error(`${key} failed; see ${logPath}`, { cause: failure }));
      if (exitCode) process.exitCode ||= exitCode;
    }
  }
  if (controller.signal.aborted && controller.signal.reason !== canceledAfterFailure) {
    failures.unshift(controller.signal.reason);
  }
  return failures;
}

const controller = new AbortController();
const onInterrupt = () => controller.abort(new Error("Integration interrupted by SIGINT"));
const onTerminate = () => controller.abort(new Error("Integration interrupted by SIGTERM"));
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
const started = performance.now();
let timer;
const failures = [];
try {
  const options = parseIntegrationArguments(process.argv.slice(2));
  options.concurrency ??= parseIntegrationConcurrency(
    process.env.IAM_TEST_INTEGRATION_CONCURRENCY ?? "3",
    "IAM_TEST_INTEGRATION_CONCURRENCY",
  );
  const root = process.cwd();
  const tasks = selectIntegrationTasks(root, options).sort((left, right) => priority(left) - priority(right));
  if (tasks.filter((task) => task.resources.redis).length > integrationRedisSlotLimit) {
    throw new Error(`Integration Redis supports at most ${integrationRedisSlotLimit} task slots`);
  }
  const playwrightTasks = tasks.filter((task) => task.executor === "playwright");
  const browserWorkers =
    options.browserWorkers ??
    (playwrightTasks.length && process.env.IAM_TEST_BROWSER_WORKERS !== undefined
      ? parseBrowserWorkers(process.env.IAM_TEST_BROWSER_WORKERS, "IAM_TEST_BROWSER_WORKERS")
      : undefined);
  if (options.browserWorkers !== undefined && playwrightTasks.length === 0) {
    throw new Error("--browser-workers requires a Playwright collection");
  }
  if (browserWorkers !== undefined && playwrightTasks.some((task) => Object.keys(task.resources).length > 0)) {
    throw new Error("--browser-workers and IAM_TEST_BROWSER_WORKERS require resource-free Playwright collections");
  }
  timer = setTimeout(
    () => controller.abort(new Error(`Integration deadline exceeded after ${options.timeoutMs}ms`)),
    options.timeoutMs,
  );
  const logDirectory = join("test-results", "integration", randomUUID(), "logs");
  await mkdir(logDirectory, { recursive: true });
  const taskEnvironments = await prepareTaskEnvironments(root, logDirectory, tasks, controller.signal);
  failures.push(
    ...(await executeTasks({ root, logDirectory, tasks, taskEnvironments, browserWorkers, options, controller })),
  );
} catch (error) {
  failures.push(error);
} finally {
  clearTimeout(timer);
  console.log(`[integration] Total wall time ${Math.round(performance.now() - started)} ms`);
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
}
if (failures.length > 0) {
  for (const failure of failures) console.error(formatResourceFailure(failure));
  process.exitCode ||= 1;
} else if (controller.signal.aborted) {
  console.error(formatResourceFailure(controller.signal.reason));
  process.exitCode = 1;
}
