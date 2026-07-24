import type { EventEmitter } from "node:events";
import type { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const windowsCommandEnvironmentKey = "IAM_PROCESS_SMOKE_COMMAND_BASE64";
const windowsJobLauncherPath = fileURLToPath(
  new URL("./fixtures/windows-job-launcher.mjs", import.meta.url),
);
const windowsJobSupervisorPath = fileURLToPath(
  new URL("./fixtures/windows-job-supervisor.ps1", import.meta.url),
);

export type ProcessTreeOwner = "posix-process-group" | "windows-job";

export interface ProcessSmokeChild extends EventEmitter {
  readonly pid?: number;
  readonly processTreeOwner?: ProcessTreeOwner;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals) => boolean;
}

export class FatalReadinessError extends Error {
  override readonly name: string = "FatalReadinessError";
}

export class PortCollisionError extends FatalReadinessError {
  override readonly name: string = "PortCollisionError";
}

type ProcessSmokeFailureKind
  = | "child-error"
    | "child-exit"
    | "cleanup"
    | "probe"
    | "readiness-timeout";

export class ProcessSmokeError extends Error {
  override readonly name = "ProcessSmokeError";

  constructor(
    readonly kind: ProcessSmokeFailureKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

class BoundedProcessOutput {
  private buffer: Buffer = Buffer.alloc(0);
  private childReadinessEvidenceObserved = false;
  private truncated = false;
  private readonly listeners: Array<{
    stream: Readable;
    listener: (chunk: Buffer | string) => void;
  }> = [];

  constructor(
    child: ProcessSmokeChild,
    private readonly maxBytes: number,
    private readonly childReadinessEvidence?: string,
  ) {
    this.observe(child.stdout, "stdout");
    this.observe(child.stderr, "stderr");
  }

  hasChildReadinessEvidence() {
    return this.childReadinessEvidence === undefined
      || this.childReadinessEvidenceObserved;
  }

  snapshot() {
    if (this.buffer.length === 0)
      return "(no output captured)";
    const output = this.buffer.toString("utf8");
    return this.truncated
      ? `[output truncated to last ${this.maxBytes} bytes]\n${output}`
      : output;
  }

  dispose() {
    for (const { stream, listener } of this.listeners)
      stream.off("data", listener);
    this.listeners.length = 0;
  }

  private observe(stream: Readable | null, source: "stdout" | "stderr") {
    if (stream === null)
      return;
    let readinessTail = Buffer.alloc(0);
    const evidence = this.childReadinessEvidence === undefined
      ? undefined
      : Buffer.from(this.childReadinessEvidence);
    const listener = (chunk: Buffer | string) => {
      const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!this.childReadinessEvidenceObserved && evidence !== undefined) {
        const searchable = Buffer.concat([readinessTail, payload]);
        this.childReadinessEvidenceObserved = searchable.includes(evidence);
        readinessTail = evidence.length <= 1
          ? Buffer.alloc(0)
          : searchable.subarray(
              Math.max(0, searchable.length - evidence.length + 1),
            );
      }
      this.append(Buffer.concat([Buffer.from(`[${source}] `), payload]));
    };
    stream.on("data", listener);
    this.listeners.push({ stream, listener });
  }

  private append(entry: Buffer) {
    if (entry.length >= this.maxBytes) {
      this.buffer = entry.subarray(entry.length - this.maxBytes);
      this.truncated = true;
    }
    else if (this.buffer.length + entry.length <= this.maxBytes) {
      this.buffer = Buffer.concat([this.buffer, entry]);
    }
    else {
      const retainedBytes = this.maxBytes - entry.length;
      this.buffer = Buffer.concat([
        this.buffer.subarray(this.buffer.length - retainedBytes),
        entry,
      ]);
      this.truncated = true;
    }
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function processDiagnostic(
  label: string,
  reason: string,
  child: ProcessSmokeChild,
  output: BoundedProcessOutput,
  detail?: string,
) {
  const state = [
    `pid=${child.pid ?? "unknown"}`,
    `exitCode=${child.exitCode ?? "null"}`,
    `signal=${child.signalCode ?? "null"}`,
  ].join(" ");
  return [
    `${label}: ${reason}`,
    `process: ${state}`,
    ...(detail === undefined ? [] : [detail]),
    "captured output:",
    output.snapshot(),
  ].join("\n");
}

function waitForDelay(delayMs: number, signal: AbortSignal) {
  if (signal.aborted)
    return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let timeout: NodeJS.Timeout;
    const onAbort = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForReadiness<T>(
  child: ProcessSmokeChild,
  output: BoundedProcessOutput,
  options: {
    label: string;
    outputDrainTimeoutMs: number;
    pollIntervalMs: number;
    probe: (signal: AbortSignal) => Promise<T | undefined>;
    readinessTimeoutMs: number;
  },
) {
  const controller = new AbortController();
  const closeWaiter = createProcessCloseWaiter(child);
  let childTerminated = false;
  let lastProbeError: Error | undefined;
  let timeout: NodeJS.Timeout | undefined;
  const cancelReadinessDeadline = () => {
    if (timeout === undefined)
      return;
    clearTimeout(timeout);
    timeout = undefined;
  };

  const childFailure = new Promise<never>((_, reject) => {
    const onError = (error: Error) => {
      childTerminated = true;
      cancelReadinessDeadline();
      reject(new ProcessSmokeError(
        "child-error",
        processDiagnostic(
          options.label,
          "child error before readiness",
          child,
          output,
          `child error: ${error.message}`,
        ),
        { cause: error },
      ));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      childTerminated = true;
      cancelReadinessDeadline();
      void closeWaiter.wait(options.outputDrainTimeoutMs).then(() => {
        reject(new ProcessSmokeError(
          "child-exit",
          processDiagnostic(
            options.label,
            "exited before readiness",
            child,
            output,
            `observed exit: code=${code ?? "null"} signal=${signal ?? "null"}`,
          ),
        ));
      });
    };
    child.once("error", onError);
    child.once("exit", onExit);
    controller.signal.addEventListener("abort", () => {
      child.off("error", onError);
      child.off("exit", onExit);
    }, { once: true });

    if (child.exitCode !== null || child.signalCode !== null)
      onExit(child.exitCode, child.signalCode);
  });

  const deadline = new Promise<never>((_, reject) => {
    if (childTerminated)
      return;
    timeout = setTimeout(() => {
      timeout = undefined;
      reject(new ProcessSmokeError(
        "readiness-timeout",
        processDiagnostic(
          options.label,
          `readiness deadline exceeded after ${options.readinessTimeoutMs}ms`,
          child,
          output,
          lastProbeError === undefined
            ? undefined
            : `last probe error: ${lastProbeError.message}`,
        ),
        lastProbeError === undefined ? undefined : { cause: lastProbeError },
      ));
    }, options.readinessTimeoutMs);
  });

  const polling = (async () => {
    while (!controller.signal.aborted) {
      try {
        const result = await options.probe(controller.signal);
        if (
          !childTerminated
          && result !== undefined
          && output.hasChildReadinessEvidence()
        ) {
          return result;
        }
      }
      catch (error) {
        if (!childTerminated && error instanceof FatalReadinessError) {
          throw new ProcessSmokeError(
            "probe",
            processDiagnostic(
              options.label,
              "readiness probe failed permanently",
              child,
              output,
              `probe error: ${error.message}`,
            ),
            { cause: error },
          );
        }
        lastProbeError = toError(error);
      }
      if (!await waitForDelay(options.pollIntervalMs, controller.signal))
        throw new Error(`${options.label}: readiness polling aborted`);
    }
    throw new Error(`${options.label}: readiness polling aborted`);
  })();

  try {
    return await Promise.race([polling, childFailure, deadline]);
  }
  finally {
    controller.abort();
    closeWaiter.dispose();
    cancelReadinessDeadline();
  }
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timeout !== undefined)
      clearTimeout(timeout);
  });
}

function hasExited(child: ProcessSmokeChild) {
  return child.exitCode !== null || child.signalCode !== null;
}

function createProcessCloseWaiter(child: ProcessSmokeChild) {
  let closed = false;
  let resolveClosed: () => void = () => {};
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const onClose = () => {
    closed = true;
    resolveClosed();
  };
  child.once("close", onClose);
  if (
    hasExited(child)
    && [child.stdout, child.stderr]
      .every(stream => stream === null || stream.closed || stream.destroyed)
  ) {
    onClose();
  }

  return {
    dispose() {
      child.off("close", onClose);
    },
    async wait(timeoutMs: number) {
      if (closed)
        return true;
      let timeout: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          closedPromise.then(() => true),
          new Promise<false>((resolve) => {
            timeout = setTimeout(resolve, timeoutMs, false);
          }),
        ]);
      }
      finally {
        if (timeout !== undefined)
          clearTimeout(timeout);
      }
    },
  };
}

async function runWindowsTreeKill(pid: number) {
  const taskkill = spawn(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await new Promise<void>((resolve, reject) => {
    taskkill.once("error", reject);
    taskkill.once("exit", code => code === 0
      ? resolve()
      : reject(new Error(`taskkill exited with code ${code ?? "null"}`)));
  });
}

function markProcessTreeOwner(
  child: ProcessSmokeChild,
  owner: ProcessTreeOwner,
) {
  Object.defineProperty(child, "processTreeOwner", {
    configurable: false,
    enumerable: false,
    value: owner,
    writable: false,
  });
  return child;
}

export function spawnOwnedProcessTree(options: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  if (process.platform === "win32") {
    const command = Buffer.from(JSON.stringify({
      executable: options.executable,
      args: options.args,
      cwd: options.cwd,
    })).toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        windowsJobSupervisorPath,
        "-NodeExecutable",
        process.execPath,
        "-LauncherPath",
        windowsJobLauncherPath,
      ],
      {
        cwd: options.cwd,
        env: {
          ...options.env,
          [windowsCommandEnvironmentKey]: command,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    return markProcessTreeOwner(child, "windows-job");
  }

  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    detached: true,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return markProcessTreeOwner(child, "posix-process-group");
}

function isMissingProcess(error: unknown) {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ESRCH";
}

function isPermissionDenied(error: unknown) {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "EPERM";
}

function isPosixProcessGroupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  }
  catch (error) {
    if (isMissingProcess(error))
      return false;
    if (isPermissionDenied(error))
      return true;
    throw error;
  }
}

async function waitForProcessTreeExit(
  isAlive: () => boolean | Promise<boolean>,
  timeoutMs: number,
  pollIntervalMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (await isAlive()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      return false;
    await new Promise(resolve =>
      setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }
  return true;
}

export interface TerminateProcessTreeOptions {
  timeoutMs: number;
  forceAfterMs?: number;
  platform?: NodeJS.Platform;
  pollIntervalMs?: number;
  isProcessTreeAlive?: (pid: number) => boolean | Promise<boolean>;
  killProcess?: (pid: number, signal: NodeJS.Signals) => void;
  runWindowsTreeKill?: (pid: number) => Promise<void>;
}

export async function terminateProcessTree(
  child: ProcessSmokeChild,
  options: TerminateProcessTreeOptions,
) {
  const startedAt = Date.now();
  const remaining = () => Math.max(1, options.timeoutMs - (Date.now() - startedAt));
  const platform = options.platform ?? process.platform;
  const closeWaiter = createProcessCloseWaiter(child);
  try {
    const pid = child.pid;
    if (pid === undefined) {
      if (!await closeWaiter.wait(remaining())) {
        throw new Error(
          "child spawn failed without a pid but did not close its stdio",
        );
      }
      return;
    }

    if (platform === "win32") {
      if (
        child.processTreeOwner === "windows-job"
        && hasExited(child)
        && await closeWaiter.wait(remaining())
      ) {
        return;
      }
      try {
        await withDeadline(
          (options.runWindowsTreeKill ?? runWindowsTreeKill)(pid),
          remaining(),
          `taskkill cleanup deadline exceeded after ${options.timeoutMs}ms`,
        );
      }
      catch (error) {
        if (
          child.processTreeOwner === "windows-job"
          && await closeWaiter.wait(remaining())
        ) {
          return;
        }
        throw error;
      }
      if (!await closeWaiter.wait(remaining()))
        throw new Error(`process tree did not exit within ${options.timeoutMs}ms after taskkill`);
      return;
    }

    const killProcess = options.killProcess ?? process.kill.bind(process);
    const isProcessTreeAlive = options.isProcessTreeAlive
      ?? isPosixProcessGroupAlive;
    const pollIntervalMs = options.pollIntervalMs ?? 25;
    const forceAfterMs = Math.min(
      options.forceAfterMs ?? Math.floor(options.timeoutMs / 2),
      options.timeoutMs,
    );

    const treeIsAlive = () => isProcessTreeAlive(pid);
    if (await treeIsAlive()) {
      try {
        killProcess(-pid, "SIGTERM");
      }
      catch (error) {
        if (!isMissingProcess(error)) {
          throw new Error(
            `failed to send SIGTERM to process group ${pid}`,
            { cause: error },
          );
        }
      }
      if (!await waitForProcessTreeExit(
        treeIsAlive,
        Math.min(forceAfterMs, remaining()),
        pollIntervalMs,
      )) {
        try {
          killProcess(-pid, "SIGKILL");
        }
        catch (error) {
          if (!isMissingProcess(error)) {
            throw new Error(
              `failed to send SIGKILL to process group ${pid}`,
              { cause: error },
            );
          }
        }
        if (!await waitForProcessTreeExit(
          treeIsAlive,
          remaining(),
          pollIntervalMs,
        )) {
          throw new Error(
            `process group ${pid} did not exit within ${options.timeoutMs}ms`,
          );
        }
      }
    }

    if (!await closeWaiter.wait(remaining()))
      throw new Error(`process group ${pid} exited but its stdio did not close`);
  }
  finally {
    closeWaiter.dispose();
  }
}

export interface RunProcessSmokeOptions<T> {
  label: string;
  start: () => ProcessSmokeChild;
  probe: (signal: AbortSignal) => Promise<T | undefined>;
  readinessTimeoutMs: number;
  cleanupTimeoutMs: number;
  childReadinessEvidence?: string;
  outputDrainTimeoutMs?: number;
  pollIntervalMs?: number;
  maxOutputBytes?: number;
  stop?: (child: ProcessSmokeChild) => Promise<void>;
}

export async function runProcessSmoke<T>(options: RunProcessSmokeOptions<T>) {
  let child: ProcessSmokeChild;
  try {
    child = options.start();
  }
  catch (error) {
    throw new ProcessSmokeError(
      "child-error",
      `${options.label}: failed to start child process: ${toError(error).message}`,
      { cause: error },
    );
  }

  const output = new BoundedProcessOutput(
    child,
    options.maxOutputBytes ?? 64 * 1024,
    options.childReadinessEvidence,
  );
  let outcome: { ok: true; value: T } | { ok: false; error: Error };
  try {
    outcome = {
      ok: true,
      value: await waitForReadiness(child, output, {
        label: options.label,
        outputDrainTimeoutMs: options.outputDrainTimeoutMs ?? 500,
        pollIntervalMs: options.pollIntervalMs ?? 100,
        probe: options.probe,
        readinessTimeoutMs: options.readinessTimeoutMs,
      }),
    };
  }
  catch (error) {
    outcome = { ok: false, error: toError(error) };
  }

  let cleanupFailure: ProcessSmokeError | undefined;
  try {
    await withDeadline(
      options.stop === undefined
        ? terminateProcessTree(child, { timeoutMs: options.cleanupTimeoutMs })
        : options.stop(child),
      options.cleanupTimeoutMs,
      `cleanup deadline exceeded after ${options.cleanupTimeoutMs}ms`,
    );
  }
  catch (error) {
    const cause = toError(error);
    cleanupFailure = new ProcessSmokeError(
      "cleanup",
      processDiagnostic(
        options.label,
        "cleanup failed",
        child,
        output,
        `cleanup error: ${cause.message}`,
      ),
      { cause },
    );
  }
  finally {
    output.dispose();
  }

  if (cleanupFailure !== undefined) {
    if (!outcome.ok) {
      throw new AggregateError(
        [outcome.error, cleanupFailure],
        `${options.label}: readiness and cleanup both failed\n${cleanupFailure.message}`,
      );
    }
    throw cleanupFailure;
  }
  if (!outcome.ok)
    throw outcome.error;
  return outcome.value;
}

export async function withOwnedTemporaryDirectory<T>(options: {
  prefix: string;
  cleanupTimeoutMs: number;
  run: (directory: string) => Promise<T>;
}) {
  if (
    options.prefix.length === 0
    || options.prefix === "."
    || options.prefix === ".."
    || /[\\/]/u.test(options.prefix)
  ) {
    throw new Error("temporary directory prefix must be a single path segment");
  }
  const directory = await mkdtemp(join(tmpdir(), options.prefix));
  let outcome: { ok: true; value: T } | { ok: false; error: Error };
  try {
    outcome = { ok: true, value: await options.run(directory) };
  }
  catch (error) {
    outcome = { ok: false, error: toError(error) };
  }

  let cleanupError: Error | undefined;
  try {
    await withDeadline(
      rm(directory, { force: true, recursive: true }),
      options.cleanupTimeoutMs,
      `temporary directory cleanup deadline exceeded after ${options.cleanupTimeoutMs}ms`,
    );
  }
  catch (error) {
    cleanupError = toError(error);
  }

  if (cleanupError !== undefined) {
    const ownedCleanupError = new Error(
      `failed to remove owned temporary directory ${directory}: ${cleanupError.message}`,
      { cause: cleanupError },
    );
    if (!outcome.ok) {
      throw new AggregateError(
        [outcome.error, ownedCleanupError],
        "process smoke attempt and temporary directory cleanup both failed",
      );
    }
    throw ownedCleanupError;
  }
  if (!outcome.ok)
    throw outcome.error;
  return outcome.value;
}

function isPortCollision(error: unknown): boolean {
  if (error instanceof AggregateError)
    return false;
  if (error instanceof PortCollisionError)
    return true;
  if (!(error instanceof Error))
    return false;
  if (/EADDRINUSE|address already in use/iu.test(error.message))
    return true;
  return isPortCollision(error.cause);
}

export async function recoverFromPortCollision<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  options: { maxAttempts: number },
) {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1)
    throw new Error("maxAttempts must be a positive integer");
  const collisions: Error[] = [];
  for (let attemptNumber = 1; attemptNumber <= options.maxAttempts; attemptNumber += 1) {
    try {
      return await attempt(attemptNumber);
    }
    catch (error) {
      if (!isPortCollision(error))
        throw error;
      collisions.push(toError(error));
    }
  }
  throw new AggregateError(
    collisions,
    `port collision persisted across ${options.maxAttempts} allocation attempts`,
  );
}
