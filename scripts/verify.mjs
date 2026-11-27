#!/usr/bin/env node
import "./require-linux.mjs";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  console.error("Usage: pnpm check | pnpm verify");
  process.exit(1);
}

const isCheckOnly = args[0] === "--check";
const checkStage = {
  name: "check",
  commands: [
    ["format:check"],
    ["lint"],
    ["typecheck"],
    ["--filter", "@iam/db", "db:check"],
    ["check:architecture"],
    ["check:docs"],
    ["check:env-names"],
  ],
};

const stages = isCheckOnly
  ? [checkStage]
  : [
      checkStage,
      { name: "test:unit", commands: [["test:unit"]] },
      { name: "test:integration", commands: [["test:integration"]] },
      { name: "build", commands: [["build"]] },
    ];

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("pnpm check / pnpm verify must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

const label = isCheckOnly ? "check" : "verify";
for (const stage of stages) {
  console.log(`\n[${label}] ${stage.name}`);
  for (const command of stage.commands) {
    const result = runPnpmCommand(pnpmCli, command);
    if (result.error) {
      console.error(`[${label}] failed to launch pnpm ${command.join(" ")}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.signal) {
      process.kill(process.pid, result.signal);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
