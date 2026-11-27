import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";

const processMarkersEnvironmentKey = "IAM_OWNED_PROCESS_MARKERS";

function requireLinux() {
  if (process.platform !== "linux") {
    throw new Error(`Owned process trees require Linux or WSL2 (current platform: ${process.platform})`);
  }
}

function inheritedMarkers(value) {
  if (!value) return [];
  const markers = JSON.parse(value);
  if (!Array.isArray(markers) || markers.some((marker) => typeof marker !== "string"))
    throw new Error("Invalid owned process ancestry");
  return markers;
}

async function linuxOwnedProcesses(marker) {
  const entries = await readdir("/proc");
  const processes = await Promise.all(
    entries
      .filter((entry) => /^\d+$/.test(entry))
      .map(async (entry) => {
        let environment;
        try {
          environment = await readFile(`/proc/${entry}/environ`, "utf8");
        } catch (error) {
          if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(error.code)) return undefined;
          throw error;
        }
        const variable = environment.split("\0").find((value) => value.startsWith(`${processMarkersEnvironmentKey}=`));
        if (!variable) return undefined;
        const value = variable.slice(processMarkersEnvironmentKey.length + 1);
        let markers;
        try {
          markers = JSON.parse(value);
        } catch {
          return undefined;
        }
        return Array.isArray(markers) && markers.includes(marker) ? Number(entry) : undefined;
      }),
  );
  return processes.filter((pid) => pid !== undefined && pid !== process.pid);
}

async function closeLinuxOwnedProcesses(marker, options) {
  const started = performance.now();
  const forceAfterMs =
    options.forceAfterMs === undefined
      ? Math.min(250, options.timeoutMs / 2)
      : Math.min(options.forceAfterMs, options.timeoutMs * 0.8);
  const signaled = new Set();
  while (true) {
    const processes = await linuxOwnedProcesses(marker);
    if (processes.length === 0) return;
    const elapsed = performance.now() - started;
    const signal = elapsed >= forceAfterMs ? "SIGKILL" : "SIGTERM";
    for (const pid of processes) {
      if (signal === "SIGTERM" && signaled.has(pid)) continue;
      signaled.add(pid);
      try {
        process.kill(pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (elapsed >= options.timeoutMs) throw new Error(`Owned process tree did not stop within ${options.timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Owns Linux descendants, including those that leave the original process group. */
export function spawnOwnedProcessTree(options) {
  requireLinux();
  const marker = randomUUID();
  const ancestry = [
    ...new Set([
      ...inheritedMarkers(process.env[processMarkersEnvironmentKey]),
      ...inheritedMarkers(options.env[processMarkersEnvironmentKey]),
    ]),
    marker,
  ];
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: { ...options.env, [processMarkersEnvironmentKey]: JSON.stringify(ancestry) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  Object.defineProperty(child, "closeOwnedProcessTree", {
    value: (cleanupOptions) => closeLinuxOwnedProcesses(marker, cleanupOptions),
  });
  return child;
}

function bounded(operation, timeoutMs, message) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function stopProcessTree(child, closed, timeoutMs, forceAfterMs) {
  if (!child.pid) return;
  const deadline = performance.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - performance.now());
  await child.closeOwnedProcessTree({ timeoutMs: remaining(), forceAfterMs });
  await bounded(closed, remaining(), "Process tree did not close before its cleanup deadline");
}

/** Owns leader exit, interruption and tree shutdown; callers retain output and failure presentation. */
export async function waitForOwnedProcessTree(child, options = {}) {
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ exitCode: code, signal }));
  });
  closed.catch(() => {});
  // Linux descendants can retain the leader's pipes after reparenting. Stop them
  // after leader exit and before waiting for close, which depends on those pipes.
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ exitCode: code, signal }));
  });
  const completed = exited.then(
    (outcome) => ({ outcome }),
    (error) => ({ executionFailure: { kind: "start", error } }),
  );
  let onAbort;
  const interrupted = new Promise((resolve) => {
    onAbort = () =>
      resolve({
        executionFailure: { kind: "abort", error: options.signal.reason ?? new Error("Command interrupted") },
      });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
  });
  let timer;
  const deadline = new Promise((resolve) => {
    if (options.timeoutMs !== undefined)
      timer = setTimeout(
        () => resolve({ executionFailure: { kind: "deadline", error: new Error("Command deadline exceeded") } }),
        options.timeoutMs,
      );
  });
  const report = await Promise.race([completed, interrupted, deadline]);
  clearTimeout(timer);
  try {
    const didFail = report.executionFailure ? report.executionFailure.kind !== "abort" : report.outcome.exitCode !== 0;
    if (didFail) options.onExecutionFailure?.();
  } finally {
    try {
      await stopProcessTree(child, closed, options.cleanupTimeoutMs ?? 5000, options.forceAfterMs);
    } catch (error) {
      report.cleanupFailure = error;
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  return report;
}
