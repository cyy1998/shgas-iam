#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { integrationProfiles, resourceEnvironmentNames } from "./test-resources/integration-selection.mjs";
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
  const profile = parameters.shift();
  let preflight;
  if (parameters[0] === "--preflight") {
    parameters.shift();
    preflight = parameters.shift();
    if (!preflight) throw new Error("--preflight requires a script path");
  }
  const [separator, executable, ...arguments_] = parameters;
  if (!integrationProfiles.includes(profile) || separator !== "--" || !executable)
    throw new Error("Expected <profile> -- <runner> [arguments]");
  const cwd = process.cwd();
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const names = resourceEnvironmentNames(manifest.name, profile);
  if (names.length > 0) {
    const recordPath = process.env.IAM_TEST_RESOURCE_RECORD;
    const runId = process.env.IAM_TEST_RESOURCE_RUN_ID;
    if (!recordPath || !runId) throw new Error("Use the root Integration entry to create managed resources");
    const run = await readManagedResourceRun(repositoryRoot(cwd), recordPath);
    if (run.record.runId !== runId || !["ready", "running"].includes(run.record.status))
      throw new Error("Managed test resource record is not ready for this run");
    const environment = JSON.parse(readFileSync(join(run.root, run.record.testEnvironmentFile), "utf8"));
    for (const name of names)
      if (!environment[name] || environment[name] !== process.env[name])
        throw new Error(`${name} must come from this run's managed resource record`);
  }
  const selection = process.env.IAM_TEST_INTEGRATION_SELECTION
    ? JSON.parse(process.env.IAM_TEST_INTEGRATION_SELECTION)
    : undefined;
  const files = selection?.[`${manifest.name}:${profile}`];
  const args = [...arguments_];
  if (profile !== "component" && executable === "bun") {
    for (let index = args.length - 1; index >= 0; index--)
      if (args[index].startsWith("--max-concurrency=")) args.splice(index, 1);
    args.splice(1, 0, "--max-concurrency=1", "--bail");
  }
  if (profile !== "component" && executable === "playwright") args.push("--workers=1", "--max-failures=1");
  if (files) {
    if (
      !Array.isArray(files) ||
      files.length === 0 ||
      files.some((file) => typeof file !== "string" || !existsSync(resolve(cwd, file)))
    )
      throw new Error("No Integration files match this package task");
    const directory =
      manifest.name === "iam-monorepo" ? `scripts/test-integration/${profile}` : `test-integration/${profile}`;
    for (const file of files)
      if (!file.startsWith(`${directory}/`) || file.includes(".."))
        throw new Error(`Integration file is outside its owner/profile: ${file}`);
    const directoryIndex = args.indexOf(directory);
    if (directoryIndex >= 0) args.splice(directoryIndex, 1);
    args.push(...files);
  }
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
