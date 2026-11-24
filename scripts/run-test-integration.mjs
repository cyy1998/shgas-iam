#!/usr/bin/env node
import { join } from "node:path";
import process from "node:process";
import {
  integrationExecutors,
  parseIntegrationArguments,
  selectIntegrationTasks,
} from "./test-resources/integration-selection.mjs";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  formatResourceFailure,
  managedServicePort,
  readManagedResourceRegistry,
  readManagedResourceRun,
  saveManagedResourceRun,
  startManagedResources,
  writeAtomicResourceRecord,
} from "./test-resources/managed-resources.mjs";
import { pnpmCommand, runOwnedCommand } from "./test-resources/owned-command.mjs";

const controller = new AbortController();
const onInterrupt = () => controller.abort(new Error("Integration interrupted by SIGINT"));
const onTerminate = () => controller.abort(new Error("Integration interrupted by SIGTERM"));
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
let timer;
let run;
let executionStart;
const failures = [];
try {
  const options = parseIntegrationArguments(process.argv.slice(2));
  const root = process.cwd();
  const tasks = selectIntegrationTasks(root, options);
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
  const environment = {
    ...process.env,
    IAM_TEST_INTEGRATION_SELECTION: JSON.stringify(
      Object.fromEntries(tasks.map((task) => [`${task.name}:${task.executor}`, task.files])),
    ),
  };
  if (browserWorkers !== undefined) environment.IAM_TEST_BROWSER_WORKERS = String(browserWorkers);
  for (const name of Object.keys(environment))
    if (/^IAM_.*_TEST_(DATABASE|REDIS)_URL$/.test(name)) delete environment[name];
  delete environment.IAM_TEST_RESOURCE_RUN_ID;
  delete environment.IAM_TEST_RESOURCE_RECORD;
  delete environment.IAM_TEST_POSTGRES_TEMPLATE;
  const names = [...new Set(tasks.flatMap((task) => task.environmentNames))];
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
  if (names.length > 0) {
    await startManagedResources(run, {
      signal: controller.signal,
      timeoutMs: options.timeoutMs,
      cleanupTimeoutMs: options.cleanupTimeoutMs,
    });
    const urls = {};
    if (services.includes("postgres"))
      urls.postgres = `postgres://iam_test:iam_test@127.0.0.1:${await managedServicePort(run, "postgres", 5432, { signal: controller.signal })}/iam_test`;
    if (services.includes("redis"))
      urls.redis = `redis://127.0.0.1:${await managedServicePort(run, "redis", 6379, { signal: controller.signal })}/0`;
    for (const name of names) environment[name] = name.endsWith("DATABASE_URL") ? urls.postgres : urls.redis;
    const testEnvironment = Object.fromEntries(names.map((name) => [name, environment[name]]));
    if (urls.postgres) {
      const templateName = "iam_test_template";
      const result = await runOwnedCommand({
        ...pnpmCommand(pnpmCli, [
          "--filter",
          "@iam/db",
          "exec",
          "bun",
          "--no-env-file",
          "test-integration/support/prepare-postgres-template.ts",
          templateName,
        ]),
        cwd: root,
        env: { ...environment, IAM_DB_TEST_DATABASE_URL: urls.postgres },
        signal: controller.signal,
        timeoutMs: options.timeoutMs,
        cleanupTimeoutMs: options.cleanupTimeoutMs,
        logFile: join(root, run.record.artifactDirectory, "template-migration.log"),
      });
      if (result.exitCode !== 0) throw new Error(`Integration PostgreSQL template migration failed:\n${result.output}`);
      testEnvironment.IAM_TEST_POSTGRES_TEMPLATE = templateName;
    }
    controller.signal.throwIfAborted();
    await writeAtomicResourceRecord(join(root, run.record.testEnvironmentFile), testEnvironment);
    run.record.status = "running";
    await saveManagedResourceRun(run);
  }
  executionStart = performance.now();
  for (const executor of integrationExecutors) {
    const selected = tasks.filter((task) => task.executor === executor);
    if (selected.length === 0) continue;
    controller.signal.throwIfAborted();
    const commands = [...new Set(selected.map((task) => task.task))];
    const filters = [...new Set(selected.map((task) => `--filter=${task.name}`))];
    const result = await runOwnedCommand({
      ...pnpmCommand(pnpmCli, ["exec", "turbo", "run", ...commands, ...filters, "--concurrency=1", "--no-daemon"]),
      cwd: root,
      env: environment,
      signal: controller.signal,
      timeoutMs: options.timeoutMs,
      cleanupTimeoutMs: options.cleanupTimeoutMs,
      inheritOutput: true,
      logFile: run ? join(root, run.record.artifactDirectory, `${executor}.log`) : undefined,
    });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
      throw new Error(`Integration ${executor} failed with exit ${result.exitCode}`);
    }
  }
} catch (error) {
  failures.push(error);
} finally {
  clearTimeout(timer);
  if (run) {
    if (executionStart !== undefined) run.record.durations.executeMs = Math.round(performance.now() - executionStart);
    // Package providers register children before starting them. The root owns recovery
    // after the owned command tree is joined, including interrupted package parents.
    try {
      const children = await readManagedResourceRegistry(run.root, `${run.record.artifactDirectory}/children.jsonl`);
      for (const path of children.reverse()) {
        try {
          const child = await readManagedResourceRun(run.root, path);
          if (child.record.status === "cleaned" || child.record.status === "kept") continue;
          if (child.record.status === "created") {
            child.record.status = "cleaned";
            await saveManagedResourceRun(child);
          } else {
            await finishManagedResourceRun(child, {
              cleanupTimeoutMs: parseIntegrationArguments(process.argv.slice(2)).cleanupTimeoutMs,
            });
          }
        } catch (error) {
          failures.push(error);
        }
      }
    } catch (error) {
      failures.push(error);
    }
    try {
      if (run.record.status === "created") {
        run.record.status = "cleaned";
        await saveManagedResourceRun(run);
      } else {
        await finishManagedResourceRun(run, {
          cleanupTimeoutMs: parseIntegrationArguments(process.argv.slice(2)).cleanupTimeoutMs,
        });
      }
    } catch (error) {
      failures.push(error);
    }
    console.log(`[test-resources] timings ${JSON.stringify(run.record.durations)}`);
  }
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
}
if (failures.length > 0) {
  for (const failure of failures) console.error(formatResourceFailure(failure));
  process.exitCode ||= 1;
}
