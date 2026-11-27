import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { finished } from "node:stream/promises";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";

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
  const log = options.fullLogFile && createWriteStream(options.fullLogFile, { flags: "wx", mode: 0o600 });
  const logResult =
    log &&
    finished(log, { cleanup: true }).catch((error) => {
      options.onExecutionFailure?.();
      return new Error(`Could not save command log ${options.fullLogFile}`, { cause: error });
    });
  if (log) {
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
  }
  const { outcome, executionFailure, cleanupFailure } = await waitForOwnedProcessTree(child, {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    cleanupTimeoutMs: options.cleanupTimeoutMs ?? 5000,
    onExecutionFailure: options.onExecutionFailure,
  });
  const failures = [];
  if (executionFailure) failures.push(executionFailure.error);
  if (cleanupFailure) failures.push(new Error("Owned command process tree cleanup failed", { cause: cleanupFailure }));
  if (outcome && outcome.exitCode !== 0 && failures.length > 0)
    failures.unshift(new Error(`Owned command failed with exit ${outcome.exitCode ?? 1}`));
  if (log) {
    child.stdout.unpipe(log);
    child.stderr.unpipe(log);
    log.end();
    const failure = await logResult;
    if (failure) failures.push(failure);
  }
  if (options.logFile) {
    try {
      await writeFile(options.logFile, output, "utf8");
    } catch (error) {
      console.warn(`Warning: command log could not be saved: ${error.message}`);
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, "Owned command failed with multiple errors");
  if (failures.length === 1) throw failures[0];
  return { ...outcome, exitCode: outcome.exitCode ?? 1, output };
}

export function pnpmCommand(pnpmCli, args) {
  return /\.[cm]?js$/i.test(pnpmCli)
    ? { executable: process.execPath, args: [pnpmCli, ...args] }
    : { executable: pnpmCli, args };
}

export function formatResourceFailure(error) {
  if (error instanceof AggregateError) return `${error.message}\n${error.errors.map(formatResourceFailure).join("\n")}`;
  return error instanceof Error
    ? `${error.message}${error.cause ? `\n${formatResourceFailure(error.cause)}` : ""}`
    : String(error);
}
