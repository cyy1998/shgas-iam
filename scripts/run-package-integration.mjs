#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { integrationDeclarations, selectIntegrationTasks } from "./test-resources/integration-selection.mjs";
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
  if (parameters[0] === "--preflight") {
    parameters.shift();
    preflight = parameters.shift();
    if (!preflight) throw new Error("--preflight requires a script path");
  }
  const [separator, executable, ...arguments_] = parameters;
  if (separator !== "--" || executable !== executor)
    throw new Error("Expected <executor> -- <same executor> [arguments]");
  const cwd = process.cwd();
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const root = repositoryRoot(cwd);
  const declaration = integrationDeclarations(manifest, root === cwd).find((item) => item.executor === executor);
  if (!declaration) throw new Error(`No Integration declaration for ${manifest.name}:${executor}`);
  const names = declaration.environmentNames;
  if (names.length > 0) {
    const recordPath = process.env.IAM_TEST_RESOURCE_RECORD;
    const runId = process.env.IAM_TEST_RESOURCE_RUN_ID;
    if (!recordPath || !runId) throw new Error("Use the root Integration entry to create managed resources");
    const run = await readManagedResourceRun(repositoryRoot(cwd), recordPath);
    if (run.record.runId !== runId || !["ready", "running"].includes(run.record.status))
      throw new Error("Managed test resource record is not ready for this run");
    for (const service of Object.keys(declaration.resources))
      if (!run.record.services.includes(service)) throw new Error(`Managed resource record is missing ${service}`);
    const environment = JSON.parse(readFileSync(join(run.root, run.record.testEnvironmentFile), "utf8"));
    for (const name of names)
      if (!environment[name] || environment[name] !== process.env[name])
        throw new Error(`${name} must come from this run's managed resource record`);
  }
  const selection = JSON.parse(process.env.IAM_TEST_INTEGRATION_SELECTION || "null");
  const files = selection?.[`${manifest.name}:${executor}`];
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== "string"))
    throw new Error("Use the root Integration entry to select this package's files");
  const selected = selectIntegrationTasks(root, { workspaces: [manifest.name], files });
  if (!selected.some((task) => task.executor === executor && task.files.length === files.length))
    throw new Error("No Integration files match this package executor");
  const args = [...arguments_];
  if (executor === "bun") {
    for (let index = args.length - 1; index >= 0; index--)
      if (args[index].startsWith("--max-concurrency=")) args.splice(index, 1);
    args.splice(1, 0, "--max-concurrency=1", "--bail");
  }
  if (executor === "vitest") args.push("--maxWorkers=1", "--no-file-parallelism", "--bail=1");
  if (executor === "playwright") args.push("--workers=1", "--max-failures=1");
  const directory = root === cwd ? "scripts/test-integration" : "test-integration";
  const directoryIndex = args.indexOf(directory);
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
