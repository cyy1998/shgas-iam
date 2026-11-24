import type { Buffer } from "node:buffer";
import { type OwnedProcessTree, spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import { createBoundedByteCapture, createBoundedLineCapture } from "./command-capture.ts";

const processCleanupTimeoutMs = 5_000;

interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions & { inheritOutput?: boolean },
) {
  const child = startCommand(command, args, options);
  if (options.inheritOutput) {
    child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  } else {
    child.stdout.resume();
    child.stderr.resume();
  }
  await waitForCommand(child, command, options.signal);
}

export async function captureCommand(
  command: string,
  args: string[],
  options: CommandOptions & { capture?: { maxBytes: number; mode: "line-tail" | "tail" } },
) {
  const maxCapturedBytes = options.capture?.maxBytes ?? 256 * 1024;
  const captureMode = options.capture?.mode ?? "prefix";
  const stdout =
    captureMode === "line-tail"
      ? createBoundedLineCapture(maxCapturedBytes)
      : createBoundedByteCapture(captureMode, maxCapturedBytes);
  const stderr =
    captureMode === "line-tail"
      ? createBoundedLineCapture(maxCapturedBytes)
      : createBoundedByteCapture(captureMode, maxCapturedBytes);
  const child = startCommand(command, args, options);
  child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
  try {
    await waitForCommand(child, command, options.signal);
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { stdout: stdout.toString(), stderr: stderr.toString() });
    throw error;
  }
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

function startCommand(command: string, args: string[], options: CommandOptions) {
  options.signal?.throwIfAborted();
  return spawnOwnedProcessTree({ executable: command, args, cwd: options.cwd, env: options.env ?? process.env });
}

async function waitForCommand(child: OwnedProcessTree, command: string, signal?: AbortSignal) {
  const { outcome, executionFailure, cleanupFailure } = await waitForOwnedProcessTree(child, {
    signal,
    cleanupTimeoutMs: processCleanupTimeoutMs,
  });
  const failures: unknown[] = [];
  if (executionFailure)
    failures.push(
      new Error(executionFailure.kind === "abort" ? `${command} command was aborted` : `${command} failed to start`, {
        cause: executionFailure.error,
      }),
    );
  if (outcome && (outcome.exitCode !== 0 || outcome.signal !== null))
    failures.push(
      new Error(`${command} exited with code ${outcome.exitCode ?? "null"} and signal ${outcome.signal ?? "null"}`),
    );
  if (cleanupFailure) failures.push(new Error(`${command} process tree cleanup failed`, { cause: cleanupFailure }));
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, `${command} failed and process tree cleanup failed`);
}
