#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const args = process.argv.slice(2);
const [gate, flag, base] = args;
const commands = {
  ci: ["verify", "test:integration"],
  release: ["verify:ci", "test:e2e", "test:e2e:container-smoke"],
};
const conditionalSmoke = gate === "container-smoke";
const valid = conditionalSmoke
  ? args.length === 3 && flag === "--base" && /^[a-f0-9]{40}$/u.test(base)
  : args.length === 1 && Object.hasOwn(commands, gate);
if (!valid) {
  console.error("Usage: pnpm verify:ci | pnpm verify:release | pnpm verify:container-smoke --base <commit-sha>");
  process.exit(1);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Verification gates must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

if (conditionalSmoke) {
  const diff = spawnSync(
    "git",
    [
      "diff",
      "--quiet",
      "--no-renames",
      `${base}^{commit}`,
      "HEAD",
      "--",
      ":(glob)**/Dockerfile",
      ":(glob)**/nginx.conf",
      ":(glob)**/package.json",
      ":(glob)**/pnpm-lock.yaml",
      ":(glob)e2e/system/docker/**",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (diff.status === 0) {
    console.log("Container Smoke skipped: no packaging paths changed.");
    process.exit(0);
  }
  if (diff.error || diff.signal || diff.status !== 1) {
    console.error("Could not compare packaging paths against the fixed verification base.", diff.error ?? "");
    process.exit(1);
  }
}

for (const command of conditionalSmoke ? ["test:e2e:container-smoke"] : commands[gate]) {
  const result = runPnpmCommand(pnpmCli, [command]);
  if (result.error) {
    console.error(`Failed to launch pnpm ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
