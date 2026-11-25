#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import {
  integrationRedisSlotLimit,
  parseIntegrationArguments,
  parseIntegrationConcurrency,
  selectIntegrationTasks,
} from "./test-resources/integration-selection.mjs";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  formatResourceFailure,
  managedServiceEndpoint,
  readManagedResourceRegistry,
  readManagedResourceRun,
  saveManagedResourceRun,
  startManagedResources,
  writeAtomicResourceRecord,
} from "./test-resources/managed-resources.mjs";
import { pnpmCommand, runOwnedCommand } from "./test-resources/owned-command.mjs";
import { prepareManagedPostgresTemplate } from "./test-resources/postgres-template.mjs";

const taskPriority = [
  "@iam/auth-api:bun",
  "@iam/sso-api:bun",
  "@iam/integration-api:bun",
  "@iam/sso-api:playwright",
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

async function prepareTaskEnvironments(run, tasks, environment, commandOptions) {
  const { root, record } = run;
  if (record.services.length > 0) await startManagedResources(run, commandOptions);

  const postgres = record.services.includes("postgres")
    ? await prepareManagedPostgresTemplate(run, { ...commandOptions, env: environment })
    : undefined;

  const redis = record.services.includes("redis")
    ? await managedServiceEndpoint(run, "redis", 6379, commandOptions)
    : undefined;
  let redisSlot = 0;
  const taskEnvironments = Object.fromEntries(
    tasks.map((task) => {
      const variables = {};
      if (task.resources.postgres) {
        variables[task.resources.postgres] = postgres.databaseUrl;
        variables.IAM_TEST_POSTGRES_TEMPLATE = postgres.templateName;
      }
      if (task.resources.redis) variables[task.resources.redis] = `redis://${redis.host}:${redis.port}/${++redisSlot}`;
      return [`${task.name}:${task.executor}`, variables];
    }),
  );

  commandOptions.signal.throwIfAborted();
  await writeAtomicResourceRecord(join(root, record.testEnvironmentFile), { tasks: taskEnvironments });
  record.status = "running";
  await saveManagedResourceRun(run);
  return taskEnvironments;
}

async function executeTasks({ run, tasks, taskEnvironments, environment, pnpmCli, options, controller }) {
  const logDirectory = join(run.record.artifactDirectory, "logs");
  await mkdir(join(run.root, logDirectory), { recursive: true });
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
        const result = await runOwnedCommand({
          ...pnpmCommand(pnpmCli, ["run", task.task]),
          cwd: join(run.root, task.directory),
          env: {
            ...environment,
            ...taskEnvironments[key],
            IAM_TEST_INTEGRATION_SELECTION: JSON.stringify({ [key]: task.files }),
          },
          signal: controller.signal,
          timeoutMs: options.timeoutMs,
          cleanupTimeoutMs: options.cleanupTimeoutMs,
          fullLogFile: join(run.root, logPath),
          onExecutionFailure: cancelRemaining,
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

async function finishIntegrationRun(run, cleanupTimeoutMs, failures, signal) {
  // All package trees are joined before the root takes over their registered resources.
  const finish = async (resource) => {
    if (resource.record.status === "created" || resource.record.services.length === 0) {
      resource.record.status = "cleaned";
      await saveManagedResourceRun(resource);
    } else {
      await finishManagedResourceRun(resource, {
        cleanupTimeoutMs,
        diagnostics: failures.length > 0 || signal.aborted,
      });
    }
  };
  try {
    const children = await readManagedResourceRegistry(run.root, `${run.record.artifactDirectory}/children.jsonl`);
    for (const path of children.reverse()) {
      try {
        const child = await readManagedResourceRun(run.root, path);
        if (child.record.status !== "cleaned" && child.record.status !== "kept") await finish(child);
      } catch (error) {
        failures.push(error);
      }
    }
  } catch (error) {
    failures.push(error);
  }
  try {
    await finish(run);
  } catch (error) {
    failures.push(error);
  }
}

const controller = new AbortController();
const onInterrupt = () => controller.abort(new Error("Integration interrupted by SIGINT"));
const onTerminate = () => controller.abort(new Error("Integration interrupted by SIGTERM"));
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
const started = performance.now();
let timer;
let run;
let options;
let executionStart;
const failures = [];
try {
  options = parseIntegrationArguments(process.argv.slice(2));
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
  const browserWorkers = options.browserWorkers ?? process.env.IAM_TEST_BROWSER_WORKERS;
  if (options.browserWorkers !== undefined && playwrightTasks.length === 0) {
    throw new Error("--browser-workers requires a Playwright collection");
  }
  if (browserWorkers !== undefined && playwrightTasks.some((task) => task.environmentNames.length > 0)) {
    throw new Error("--browser-workers and IAM_TEST_BROWSER_WORKERS require resource-free Playwright collections");
  }
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("Integration must be launched through a pnpm lifecycle script.");
  timer = setTimeout(
    () => controller.abort(new Error(`Integration deadline exceeded after ${options.timeoutMs}ms`)),
    options.timeoutMs,
  );
  const environment = { ...process.env };
  if (browserWorkers !== undefined) environment.IAM_TEST_BROWSER_WORKERS = String(browserWorkers);
  for (const name of Object.keys(environment)) {
    if (/^IAM_.*_TEST_(DATABASE|REDIS)_URL$/.test(name)) delete environment[name];
  }
  delete environment.IAM_TEST_INTEGRATION_SELECTION;
  delete environment.IAM_TEST_POSTGRES_TEMPLATE;
  const services = ["postgres", "redis"].filter((service) => tasks.some((task) => task.resources[service]));
  // Even workspaces without shared data services may create child Compose projects.
  run = await createManagedResourceRun({
    root,
    composeFile: "scripts/test-resources/compose.yaml",
    services,
    keep: options.keep,
    registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
  });
  environment.IAM_TEST_RESOURCE_RUN_ID = run.record.runId;
  environment.IAM_TEST_RESOURCE_RECORD = run.recordPath;
  const taskEnvironments = await prepareTaskEnvironments(run, tasks, environment, {
    signal: controller.signal,
    timeoutMs: options.timeoutMs,
    cleanupTimeoutMs: options.cleanupTimeoutMs,
  });
  executionStart = performance.now();
  failures.push(...(await executeTasks({ run, tasks, taskEnvironments, environment, pnpmCli, options, controller })));
} catch (error) {
  failures.push(error);
} finally {
  clearTimeout(timer);
  if (run) {
    if (executionStart !== undefined) run.record.durations.executeMs = Math.round(performance.now() - executionStart);
    await finishIntegrationRun(run, options.cleanupTimeoutMs, failures, controller.signal);
    console.log(`[test-resources] timings ${JSON.stringify(run.record.durations)}`);
    console.log(`[integration] Total wall time ${Math.round(performance.now() - started)} ms`);
  }
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
