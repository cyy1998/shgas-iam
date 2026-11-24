#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const args = process.argv.slice(2);
const [gate, flag, base] = args;
const e2eRuntimeCommand = ["--filter", "@iam/e2e-system", "test:integration"];
const commands = {
  ci: [["verify"], ["test:integration"]],
  release: [["verify:ci"], e2eRuntimeCommand, ["test:e2e"], ["test:e2e:container-smoke"]],
};
const conditionalGates = {
  "container-smoke": {
    command: ["test:e2e:container-smoke"],
    label: "Container Smoke",
    pathLabel: "packaging paths",
    pathspecs: [
      ":(glob)**/Dockerfile",
      ":(glob)**/nginx.conf",
      ":(glob)**/package.json",
      ":(glob)**/pnpm-lock.yaml",
      ":(glob)e2e/system/docker/**",
    ],
  },
  "e2e-runtime": {
    command: e2eRuntimeCommand,
    label: "E2E Runtime",
    pathLabel: "E2E runtime paths",
    pathspecs: [
      ":(glob)e2e/system/**",
      ":(glob)packages/runtime/**",
      ":(glob)scripts/test-resources/**",
      "scripts/run-verification-gate.mjs",
      ":(glob)**/package.json",
      "pnpm-lock.yaml",
      "turbo.json",
      ":(glob)**/vite.config.*",
      ":(glob)**/Dockerfile",
    ],
  },
};
const conditional = Object.hasOwn(conditionalGates, gate) ? conditionalGates[gate] : undefined;
const valid = conditional
  ? args.length === 3 && flag === "--base" && /^[a-f0-9]{40}$/u.test(base)
  : args.length === 1 && Object.hasOwn(commands, gate);
if (!valid) {
  console.error(
    "Usage: pnpm verify:ci | pnpm verify:release | pnpm verify:container-smoke --base <commit-sha> | pnpm verify:e2e-runtime --base <commit-sha>",
  );
  process.exit(1);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Verification gates must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

if (conditional) {
  const diff = spawnSync(
    "git",
    ["diff", "--quiet", "--no-renames", `${base}^{commit}`, "HEAD", "--", ...conditional.pathspecs],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (diff.status === 0) {
    console.log(`${conditional.label} skipped: no ${conditional.pathLabel} changed.`);
    process.exit(0);
  }
  if (diff.error || diff.signal || diff.status !== 1) {
    console.error(`Could not compare ${conditional.pathLabel} against the fixed verification base.`, diff.error ?? "");
    process.exit(1);
  }
}

for (const command of conditional ? [conditional.command] : commands[gate]) {
  const result = runPnpmCommand(pnpmCli, command);
  if (result.error) {
    console.error(`Failed to launch pnpm ${command.join(" ")}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
