#!/usr/bin/env node
import "./require-linux.mjs";
import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import {
  integrationDeclarations,
  integrationRedisSlotLimit,
  parseBrowserWorkers,
  selectIntegrationTasks,
  taskRequiresGatewayApisix,
  testPostgresUrlEnv,
  testRedisUrlEnv,
} from "./test-resources/integration-selection.mjs";
import { formatResourceFailure, readManagedResourceRun } from "./test-resources/managed-resources.mjs";
import { pnpmCommand, runOwnedCommand } from "./test-resources/owned-command.mjs";

function repositoryRoot(directory) {
  let root = directory;
  while (!existsSync(join(root, "pnpm-workspace.yaml"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error("Integration runner requires a workspace repository");
    root = parent;
  }
  return root;
}

const controller = new AbortController();
const interrupt = () => controller.abort(new Error("Package Integration interrupted"));
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
try {
  const parameters = process.argv.slice(2);
  const executor = parameters.shift();
  let preflight;
  let browserWorkers;
  while (["--preflight", "--browser-workers"].includes(parameters[0])) {
    const option = parameters.shift();
    const value = parameters.shift();
    if (option === "--browser-workers") {
      if (browserWorkers !== undefined) throw new Error("--browser-workers may be supplied once");
      browserWorkers = parseBrowserWorkers(value, option);
    } else {
      if (!value) throw new Error(`${option} requires a script path`);
      preflight = value;
    }
  }
  const [separator, executable, ...arguments_] = parameters;
  if (separator !== "--" || executable !== executor)
    throw new Error("Expected <executor> -- <same executor> [arguments]");
  const cwd = process.cwd();
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const root = repositoryRoot(cwd);
  const declaration = integrationDeclarations(manifest).find((item) => item.executor === executor);
  if (!declaration) throw new Error(`No Integration declaration for ${manifest.name}:${executor}`);
  const taskKey = `${manifest.name}:${executor}`;
  const names = declaration.environmentNames;
  const testEnvironment = { ...process.env };
  delete testEnvironment[testPostgresUrlEnv];
  delete testEnvironment[testRedisUrlEnv];
  delete testEnvironment.IAM_TEST_POSTGRES_TEMPLATE;
  delete testEnvironment.IAM_TEST_APISIX_ADMIN_URL;
  delete testEnvironment.IAM_TEST_APISIX_ADMIN_KEY;
  const workerOverride = executor === "playwright" ? process.env.IAM_TEST_BROWSER_WORKERS : undefined;
  const parallelBrowser = executor === "playwright" && names.length === 0;
  if (!parallelBrowser && (browserWorkers !== undefined || workerOverride !== undefined)) {
    throw new Error("Browser worker overrides require a resource-free Playwright collection");
  }
  const recordPath = process.env.IAM_TEST_RESOURCE_RECORD;
  const runId = process.env.IAM_TEST_RESOURCE_RUN_ID;
  if (!recordPath || !runId) throw new Error("Use the root Integration entry to create managed resources");
  const run = await readManagedResourceRun(root, recordPath);
  if (run.record.runId !== runId || run.record.status !== "running")
    throw new Error("Managed test resource record is not ready for this run");
  for (const service of Object.keys(declaration.resources))
    if (!run.record.services.includes(service)) throw new Error(`Managed resource record is missing ${service}`);
  const record = JSON.parse(readFileSync(join(run.root, run.record.testEnvironmentFile), "utf8"));
  const environment = record.tasks?.[taskKey];
  if (!environment || typeof environment !== "object" || Array.isArray(environment))
    throw new Error(`Managed resource record is missing the assignment for ${taskKey}`);
  for (const name of names) {
    if (!environment[name] || environment[name] !== process.env[name])
      throw new Error(`${name} must come from this run's managed resource record for ${taskKey}`);
    testEnvironment[name] = environment[name];
  }
  if (declaration.resources.redis) {
    const url = URL.parse(environment[testRedisUrlEnv]);
    const slot = /^\/([1-9]\d*)$/u.exec(url?.pathname)?.[1];
    if (
      url?.protocol !== "redis:" ||
      !url.hostname ||
      !url.port ||
      url.search ||
      url.hash ||
      !slot ||
      Number(slot) > integrationRedisSlotLimit
    )
      throw new Error(`Managed resource record has an invalid Redis slot for ${taskKey}`);
  }
  if (declaration.resources.postgres) {
    const templateName = environment.IAM_TEST_POSTGRES_TEMPLATE;
    if (typeof templateName !== "string" || !templateName)
      throw new Error("Managed resource record is missing the PostgreSQL template");
    testEnvironment.IAM_TEST_POSTGRES_TEMPLATE = templateName;
  }
  const selection = JSON.parse(process.env.IAM_TEST_INTEGRATION_SELECTION || "null");
  const files = selection?.[taskKey];
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== "string"))
    throw new Error("Use the root Integration entry to select this package's files");
  const selected = selectIntegrationTasks(root, { workspaces: [manifest.name], files });
  const selectedTask = selected.find((task) => task.executor === executor && task.files.length === files.length);
  if (!selectedTask) throw new Error("No Integration files match this package executor");
  if (taskRequiresGatewayApisix(selectedTask)) {
    for (const name of ["IAM_TEST_APISIX_ADMIN_URL", "IAM_TEST_APISIX_ADMIN_KEY"]) {
      if (typeof environment[name] !== "string" || !environment[name] || environment[name] !== process.env[name])
        throw new Error(`${name} must come from this run's managed resource record for ${taskKey}`);
      testEnvironment[name] = environment[name];
    }
  }
  const args = [...arguments_];
  if (executor === "bun") {
    for (let index = args.length - 1; index >= 0; index--)
      if (args[index].startsWith("--max-concurrency=")) args.splice(index, 1);
    args.splice(1, 0, "--max-concurrency=1", "--bail");
  }
  if (executor === "vitest") args.push("--maxWorkers=1", "--no-file-parallelism", "--bail=1");
  if (executor === "playwright") {
    if (args.some((arg) => /^(?:--workers(?:=|$)|-j)/.test(arg))) {
      throw new Error("Configure Playwright workers through --browser-workers or IAM_TEST_BROWSER_WORKERS");
    }
    const workers = parallelBrowser
      ? (browserWorkers ??
        (workerOverride === undefined
          ? Math.min(4, Math.max(2, Math.floor(availableParallelism() / 2)))
          : parseBrowserWorkers(workerOverride, "IAM_TEST_BROWSER_WORKERS")))
      : 1;
    args.push(`--workers=${workers}`, "--max-failures=1", "--retries=0");
  }
  const directoryIndex = args.indexOf("test-integration");
  if (directoryIndex >= 0) args.splice(directoryIndex, 1);
  args.push(...files);
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("Package Integration must be launched through pnpm");
  if (preflight) {
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: [resolve(cwd, preflight)],
      cwd,
      signal: controller.signal,
      inheritOutput: true,
    });
    if (result.exitCode !== 0) throw new Error(`Browser preflight failed with exit ${result.exitCode}`);
  }
  const result = await runOwnedCommand({
    ...pnpmCommand(pnpmCli, ["exec", executable, ...args]),
    cwd,
    env: testEnvironment,
    signal: controller.signal,
    inheritOutput: true,
  });
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(formatResourceFailure(error));
  process.exitCode = 1;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
