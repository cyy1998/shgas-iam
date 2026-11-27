#!/usr/bin/env node
import "./require-linux.mjs";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const ROOT_DOCUMENTATION_FILES = new Set(["README.md", "AGENTS.md", "GLOSSARY.md", ".sandcastle/README.md"]);
const WORKSPACE_README_PATTERN = /^(?:apps|packages)\/[^/]+\/README\.md$/;

function isDocumentation(path) {
  return (
    (path.startsWith("docs/") && path.endsWith(".md")) ||
    ROOT_DOCUMENTATION_FILES.has(path) ||
    WORKSPACE_README_PATTERN.test(path)
  );
}

function inspectDiff(baseRef) {
  const base = git("rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`).trim();
  const candidate = git("rev-parse", "--verify", "HEAD^{commit}").trim();
  if (git("merge-base", base, candidate).trim() !== base) {
    return {
      ok: false,
      reason: "The target commit must be an ancestor of HEAD. Integrate the target branch before verifying.",
    };
  }

  // Compare both paths of a rename and reject mode changes or symlinks.
  const changes = git("diff", "--raw", "-z", "--no-color", "--no-renames", base, candidate, "--");
  if (!changes) {
    return { ok: false, reason: "The candidate has no changes relative to the target commit." };
  }

  const fields = changes.split("\0");
  const filesToFormat = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const [previousMode, mode] = fields[index].slice(1).split(" ", 2);
    const path = fields[index + 1];
    if (!isDocumentation(path) || ![previousMode, mode].every((value) => value === "000000" || value === "100644")) {
      return {
        ok: false,
        reason: `Change outside the documentation-only scope: ${JSON.stringify(path)}. Run pnpm check.`,
      };
    }
    if (mode === "100644") filesToFormat.push(path);
  }

  return { ok: true, base, candidate, filesToFormat };
}

function classifyDocsOnly(args) {
  if (args.length !== 2 || args[0] !== "--base" || !args[1]) {
    throw new Error("Usage: node scripts/verify-docs.mjs --classify --base <target-commit>");
  }
  try {
    const inspection = inspectDiff(args[1]);
    console.log(inspection.ok ? "true" : "false");
    return 0;
  } catch {
    console.log("false");
    return 0;
  }
}

function verifyDocs(args) {
  if (args[0] === "--classify") {
    return classifyDocsOnly(args.slice(1));
  }
  if (args.length !== 2 || args[0] !== "--base" || !args[1]) {
    throw new Error("Usage: node scripts/verify-docs.mjs [--classify] --base <target-commit>");
  }
  const pnpmCli = process.env.npm_execpath || "pnpm";
  if (git("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none")) {
    throw new Error("Commit the candidate and use a clean worktree.");
  }

  const inspection = inspectDiff(args[1]);
  if (!inspection.ok) {
    throw new Error(inspection.reason);
  }
  const { base, candidate, filesToFormat } = inspection;

  console.log(`[verify-docs] ${base}..${candidate}`);
  execFileSync("git", ["diff", "--check", base, candidate, "--"], { stdio: "inherit" });
  const checks = [["check:docs"]];
  if (filesToFormat.length > 0) checks.unshift(["exec", "prettier", "--check", "--", ...filesToFormat]);
  for (const command of checks) {
    const result = runPnpmCommand(pnpmCli, command);
    if (result.error) throw result.error;
    if (result.signal) {
      process.kill(process.pid, result.signal);
      return 1;
    }
    if (result.status !== 0) return result.status ?? 1;
  }
  console.log("[verify-docs] passed");
  return 0;
}

try {
  process.exitCode = verifyDocs(process.argv.slice(2));
} catch (error) {
  console.error(`[verify-docs] ${error.message}`);
  process.exitCode = 1;
}
