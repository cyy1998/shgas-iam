#!/usr/bin/env node
import "./require-linux.mjs";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";
import { evaluateContainerSmokeTrigger, evaluateE2eRuntimeTrigger } from "./verification-gate-selection.mjs";

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
    evaluate: (repoRoot, baseSha) => evaluateContainerSmokeTrigger({ repoRoot, base: baseSha }),
  },
  "e2e-runtime": {
    command: e2eRuntimeCommand,
    label: "E2E Runtime",
    pathLabel: "E2E runtime paths",
    evaluate: (repoRoot, baseSha) => evaluateE2eRuntimeTrigger({ repoRoot, base: baseSha }),
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
  try {
    const verdict = conditional.evaluate(process.cwd(), base);
    if (!verdict.shouldRun) {
      console.log(`${conditional.label} skipped: no ${conditional.pathLabel} changed.`);
      process.exit(0);
    }
    console.log(`${conditional.label} triggered by: ${verdict.reasons.join("; ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
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
