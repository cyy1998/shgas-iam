import type { Buffer } from "node:buffer";
import type { ChildProcess } from "node:child_process";
import type {
  CapturedCommandRunner,
  CommandRunner,
} from "./docker-infra.ts";
import { spawn } from "node:child_process";
import {
  createBoundedByteCapture,
  createBoundedLineCapture,
} from "./command-capture.ts";

const abortedCommandWaitMs = 2_000;

export const runCommand: CommandRunner = async (command, args, options) => {
  const child = startCommand(command, args, options, "ignore");
  await waitForCommand(child, command, options.signal);
};

export const captureCommand: CapturedCommandRunner = async (
  command,
  args,
  options,
) => {
  const maxCapturedBytes = options.capture?.maxBytes ?? 256 * 1024;
  const captureMode = options.capture?.mode ?? "prefix";
  const stdout = captureMode === "line-tail"
    ? createBoundedLineCapture(maxCapturedBytes)
    : createBoundedByteCapture(captureMode, maxCapturedBytes);
  const stderr = captureMode === "line-tail"
    ? createBoundedLineCapture(maxCapturedBytes)
    : createBoundedByteCapture(captureMode, maxCapturedBytes);
  const child = startCommand(
    command,
    args,
    options,
    ["ignore", "pipe", "pipe"],
  );
  if (child.stdout === null || child.stderr === null)
    throw new Error(`failed to capture output from ${command}`);
  child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
  await waitForCommand(child, command, options.signal);
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};

function startCommand(
  command: string,
  args: string[],
  options: Parameters<CommandRunner>[2],
  stdio: "ignore" | ["ignore", "pipe", "pipe"],
) {
  return spawn(command, args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env ?? process.env,
    stdio,
    windowsHide: true,
  });
}

function waitForCommand(
  child: ChildProcess,
  command: string,
  abortSignal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    let completed = false;
    let abortRequested = false;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (completed)
        return;
      completed = true;
      if (abortTimer !== undefined)
        clearTimeout(abortTimer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      abortSignal?.removeEventListener("abort", onAbort);
      error === undefined ? resolve() : reject(error);
    };
    const abortError = () => new Error(`${command} command was aborted`, {
      cause: abortSignal?.reason,
    });
    function onError(error: Error) {
      finish(new Error(
        `failed to start ${command}`,
        { cause: error },
      ));
    }
    function onClose(
      code: number | null,
      signal: NodeJS.Signals | null,
    ) {
      if (abortRequested) {
        finish(abortError());
        return;
      }
      if (code === 0 && signal === null) {
        finish();
        return;
      }
      finish(new Error(
        `${command} exited with code ${code ?? "null"} and signal ${signal ?? "null"}`,
      ));
    }
    function onAbort() {
      if (abortRequested || completed)
        return;
      abortRequested = true;
      bestEffortTerminateProcessTree(child.pid);
      abortTimer = setTimeout(() => finish(abortError()), abortedCommandWaitMs);
    }
    child.once("error", onError);
    child.once("close", onClose);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted)
      onAbort();
  });
}

function bestEffortTerminateProcessTree(pid: number | undefined) {
  if (pid === undefined)
    return;
  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("error", () => undefined);
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  }
  catch {
    try {
      process.kill(pid, "SIGKILL");
    }
    catch {
      // Best-effort termination allows residue for explicit recovery.
    }
  }
}
