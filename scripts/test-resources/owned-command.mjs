import { writeFile } from "node:fs/promises";
import process from "node:process";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/api-core/process";

export async function runOwnedCommand(options) {
  options.signal?.throwIfAborted();
  const child = spawnOwnedProcessTree({
    executable: options.executable,
    args: options.args ?? [],
    cwd: options.cwd,
    env: options.env ?? process.env,
  });
  let output = "";
  const capture = (chunk, stream) => {
    output = (output + chunk.toString()).slice(-128 * 1024);
    if (options.inheritOutput) stream.write(chunk);
  };
  child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
  child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
  const { outcome, executionFailure, cleanupFailure } = await waitForOwnedProcessTree(child, {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    cleanupTimeoutMs: options.cleanupTimeoutMs ?? 5000,
  });
  const failures = [];
  if (executionFailure) failures.push(executionFailure.error);
  if (cleanupFailure) failures.push(new Error("Owned command process tree cleanup failed", { cause: cleanupFailure }));
  if (outcome && outcome.exitCode !== 0 && failures.length > 0)
    failures.unshift(new Error(`Owned command failed with exit ${outcome.exitCode ?? 1}`));
  if (options.logFile) {
    try {
      await writeFile(options.logFile, output, "utf8");
    } catch (error) {
      console.warn(`Warning: command log could not be saved: ${error.message}`);
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, "Command execution and process tree cleanup both failed");
  if (failures.length === 1) throw failures[0];
  return { ...outcome, exitCode: outcome.exitCode ?? 1, output };
}

export function pnpmCommand(pnpmCli, args) {
  return /\.[cm]?js$/i.test(pnpmCli)
    ? { executable: process.execPath, args: [pnpmCli, ...args] }
    : { executable: pnpmCli, args };
}
