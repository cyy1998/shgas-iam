#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
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
  saveManagedResourceRun,
  startManagedResources,
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
  for (const name of Object.keys(environment))
    if (/^IAM_.*_TEST_(DATABASE|REDIS)_URL$/.test(name)) delete environment[name];
  delete environment.IAM_TEST_RESOURCE_RUN_ID;
  delete environment.IAM_TEST_RESOURCE_RECORD;
  const names = [...new Set(tasks.flatMap((task) => task.environmentNames))];
  if (names.length > 0) {
    const services = ["postgres", "redis"].filter((service) => tasks.some((task) => task.resources[service]));
    run = await createManagedResourceRun({
      root,
      composeFile: "scripts/test-resources/compose.yaml",
      services,
      keep: options.keep,
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    });
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
    environment.IAM_TEST_RESOURCE_RUN_ID = run.record.runId;
    environment.IAM_TEST_RESOURCE_RECORD = run.recordPath;
    await writeFile(
      join(root, run.record.testEnvironmentFile),
      `${JSON.stringify(Object.fromEntries(names.map((name) => [name, environment[name]])), null, 2)}\n`,
      { mode: 0o600 },
    );
    run.record.status = "running";
    await saveManagedResourceRun(run);
  }
  executionStart = performance.now();
  for (const executor of integrationExecutors) {
    const selected = tasks.filter((task) => task.executor === executor);
    if (selected.length === 0) continue;
    controller.signal.throwIfAborted();
    const commands = [...new Set(selected.map((task) => task.task))];
    const filters = [...new Set(selected.map((task) => `--filter=${task.directory === "." ? "//" : task.name}`))];
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
    try {
      await finishManagedResourceRun(run, {
        cleanupTimeoutMs: parseIntegrationArguments(process.argv.slice(2)).cleanupTimeoutMs,
      });
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
