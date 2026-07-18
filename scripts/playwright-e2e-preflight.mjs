#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

if (
  process.env.PLAYWRIGHT_E2E_SKIP_PREFLIGHT === "1"
  || process.platform !== "linux"
) {
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "install-deps", "chromium", "--dry-run"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  },
);

if (result.status === 0) {
  process.exit(0);
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  .trim()
  .replace(/\nundefined\s*$/u, "");

console.error("");
console.error(
  "Playwright Chromium cannot start because Linux/WSL system dependencies are missing.",
);
console.error(
  "Run this once from the repository root, then retry the e2e command:",
);
console.error("");
console.error("  pnpm e2e:install");
console.error("");
console.error(
  "If your WSL distro asks for sudo, enter your Linux user password.",
);
console.error(
  "To skip this preflight after installing deps manually, set PLAYWRIGHT_E2E_SKIP_PREFLIGHT=1.",
);

if (output) {
  console.error("");
  console.error(output);
}

process.exit(result.status ?? 1);
