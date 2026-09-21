#!/usr/bin/env node
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const gate = process.argv[2];
const commands = gate === "ci"
  ? ["verify", "test:integration"]
  : gate === "release"
    ? ["verify:ci", "test:e2e"]
    : undefined;
if (!commands) {
  console.error(`Unknown verification gate: ${gate ?? "<missing>"}`);
  process.exit(1);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Verification gates must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

for (const command of commands) {
  const result = runPnpmCommand(pnpmCli, [command]);
  if (result.error) {
    console.error(`Failed to launch pnpm ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(1);
  }
  if (result.status !== 0)
    process.exit(result.status ?? 1);
}
