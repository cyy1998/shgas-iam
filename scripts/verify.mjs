#!/usr/bin/env node
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--static")) {
  console.error("Usage: pnpm verify [--static]");
  process.exit(1);
}

const stages = [
  {
    name: "static",
    commands: [["lint"], ["check:docs"], ["check:env-names"], ["check:architecture"], ["check:test-collection"]],
  },
  { name: "typecheck", commands: [["typecheck"]] },
  { name: "test:unit", commands: [["test:unit"]] },
  { name: "build", commands: [["build"]] },
];

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("pnpm verify must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

const selectedStages = args[0] === "--static" ? stages.slice(0, 1) : stages;
for (const stage of selectedStages) {
  console.log(`\n[verify] ${stage.name}`);
  for (const args of stage.commands) {
    const result = runPnpmCommand(pnpmCli, args);
    if (result.error) {
      console.error(`[verify] failed to launch pnpm ${args.join(" ")}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0)
      process.exit(result.status ?? 1);
  }
}
