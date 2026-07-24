#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const stages = [
  { name: "static", commands: [["lint"], ["check:docs"], ["check:env-names"]] },
  { name: "typecheck", commands: [["typecheck"]] },
  { name: "test", commands: [["test"]] },
  { name: "smoke", commands: [["test:smoke"]] },
  { name: "build", commands: [["build"]] },
];

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("pnpm verify must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

for (const stage of stages) {
  console.log(`\n[verify] ${stage.name}`);
  for (const args of stage.commands) {
    const result = spawnSync(process.execPath, [pnpmCli, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) {
      console.error(`[verify] failed to launch pnpm ${args.join(" ")}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0)
      process.exit(result.status ?? 1);
  }
}
