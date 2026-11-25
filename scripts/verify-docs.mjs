#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

const ROOT_DOCUMENTATION_FILES = new Set(["README.md", "AGENTS.md", "GLOSSARY.md"]);

function isDocumentation(path) {
  return (path.startsWith("docs/") && path.endsWith(".md")) || ROOT_DOCUMENTATION_FILES.has(path);
}

function verifyDocs(args) {
  if (args.length !== 2 || args[0] !== "--base" || !args[1]) {
    throw new Error("Usage: pnpm verify:docs --base <target-commit>");
  }
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("verify:docs must be launched through a pnpm lifecycle script.");
  if (git("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none")) {
    throw new Error("Commit the candidate and use a clean worktree.");
  }

  const base = git("rev-parse", "--verify", "--end-of-options", `${args[1]}^{commit}`).trim();
  const candidate = git("rev-parse", "--verify", "HEAD^{commit}").trim();
  if (git("merge-base", base, candidate).trim() !== base) {
    throw new Error("The target commit must be an ancestor of HEAD. Integrate the target branch before verifying.");
  }

  // Compare both paths of a rename and reject mode changes or symlinks.
  const changes = git("diff", "--raw", "-z", "--no-color", "--no-renames", base, candidate, "--");
  if (!changes) throw new Error("The candidate has no changes relative to the target commit.");
  const fields = changes.split("\0");
  const filesToFormat = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const [previousMode, mode] = fields[index].slice(1).split(" ", 2);
    const path = fields[index + 1];
    if (!isDocumentation(path) || ![previousMode, mode].every((value) => value === "000000" || value === "100644")) {
      throw new Error(`Change outside the documentation-only scope: ${JSON.stringify(path)}. Run pnpm verify.`);
    }
    if (mode === "100644") filesToFormat.push(path);
  }

  console.log(`[verify:docs] ${base}..${candidate}`);
  execFileSync("git", ["diff", "--check", base, candidate, "--"], { stdio: "inherit" });
  const checks = [["check:docs"]];
  if (filesToFormat.length > 0) checks.unshift(["exec", "prettier", "--check", "--", ...filesToFormat]);
  for (const command of checks) {
    const result = runPnpmCommand(pnpmCli, command);
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  console.log("[verify:docs] passed");
  return 0;
}

try {
  process.exitCode = verifyDocs(process.argv.slice(2));
} catch (error) {
  console.error(`[verify:docs] ${error.message}`);
  process.exitCode = 1;
}
