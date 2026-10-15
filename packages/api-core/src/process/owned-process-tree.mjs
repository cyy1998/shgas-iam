import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const commandEnvironmentKey = "IAM_OWNED_PROCESS_COMMAND_BASE64";
const processMarkersEnvironmentKey = "IAM_OWNED_PROCESS_MARKERS";
const launcherPath = fileURLToPath(new URL("./windows-job-launcher.mjs", import.meta.url));
const supervisorPath = fileURLToPath(new URL("./windows-job-supervisor.ps1", import.meta.url));

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
        let markers;
        try {
          markers = JSON.parse(variable.slice(processMarkersEnvironmentKey.length + 1));
        } catch {
          return undefined;
        }
        return Array.isArray(markers) && markers.includes(marker) ? Number(entry) : undefined;
      }),
  );
  return processes.filter((pid) => pid !== undefined && pid !== process.pid);
}

async function closeLinuxOwnedProcessTree(marker, options) {
  const started = performance.now();
  const forceAfterMs = Math.min(options.forceAfterMs ?? 250, options.timeoutMs / 2);
  while (true) {
    const processes = await linuxOwnedProcesses(marker);
    if (processes.length === 0) return;
    const elapsed = performance.now() - started;
    const signal = elapsed >= forceAfterMs ? "SIGKILL" : "SIGTERM";
    for (const pid of processes) {
      try {
        process.kill(pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (elapsed >= options.timeoutMs)
      throw new Error(`Owned Linux process tree did not stop within ${options.timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Node/Bun 共用的进程树所有权；Windows Job 在主进程正常退出后也关闭其遗留执行者。
 * Linux 使用继承的 IAM_OWNED_PROCESS_MARKERS 精确停止 detached 后代；显式子进程 env 保留该内部 ancestry。
 */
export function spawnOwnedProcessTree(options) {
  const windows = process.platform === "win32";
  const linux = process.platform === "linux";
  const marker = linux ? randomUUID() : undefined;
  const ancestry = linux
    ? [
        ...new Set([
          ...inheritedMarkers(process.env[processMarkersEnvironmentKey]),
          ...inheritedMarkers(options.env[processMarkersEnvironmentKey]),
        ]),
        marker,
      ]
    : undefined;
  const command = windows
    ? Buffer.from(JSON.stringify({ executable: options.executable, args: options.args, cwd: options.cwd })).toString(
        "base64",
      )
    : undefined;
  const powershell = join(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const child = spawn(
    windows ? powershell : options.executable,
    windows
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          supervisorPath,
          "-NodeExecutable",
          process.execPath,
          "-LauncherPath",
          launcherPath,
          "-RuntimeKind",
          process.versions.bun === undefined ? "node" : "bun",
        ]
      : options.args,
    {
      cwd: options.cwd,
      env: windows
        ? { ...options.env, [commandEnvironmentKey]: command }
        : linux
          ? { ...options.env, [processMarkersEnvironmentKey]: JSON.stringify(ancestry) }
          : options.env,
      detached: !windows,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  Object.defineProperty(child, "processTreeOwner", {
    configurable: false,
    enumerable: false,
    value: windows ? "windows-job" : "posix-process-group",
    writable: false,
  });
  if (linux)
    Object.defineProperty(child, "closeOwnedProcessTree", {
      configurable: false,
      enumerable: false,
      value: (cleanupOptions) => closeLinuxOwnedProcessTree(marker, cleanupOptions),
      writable: false,
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

async function stopProcessTree(child, closed, timeoutMs) {
  if (!child.pid) return;
  const deadline = performance.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - performance.now());
  const waitForClose = () => bounded(closed, remaining(), "Process tree did not close before its cleanup deadline");
  if (child.closeOwnedProcessTree) {
    await child.closeOwnedProcessTree({ timeoutMs: remaining() });
  } else if (process.platform === "win32") {
    // The Job supervisor closes descendants on normal exit. While it is still running,
    // taskkill stops the supervisor and its Job; never rely on the caller's PATH.
    if (child.exitCode === null && child.signalCode === null) {
      const killer = spawn(
        join(process.env.SystemRoot ?? "C:/Windows", "System32/taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      try {
        const code = await bounded(
          new Promise((resolve, reject) => {
            killer.once("error", reject);
            killer.once("close", resolve);
          }),
          remaining(),
          "Process tree termination exceeded its deadline",
        );
        if (code !== 0 && child.exitCode === null && child.signalCode === null)
          throw new Error(`taskkill failed with ${code}`);
      } catch (error) {
        killer.kill();
        throw error;
      }
    }
  } else {
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    killGroup("SIGTERM");
    let timer;
    try {
      await Promise.race([
        closed,
        new Promise((resolve) => {
          timer = setTimeout(resolve, Math.min(remaining(), 500));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    killGroup("SIGKILL");
  }
  await waitForClose();
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
  const exited =
    process.platform === "linux"
      ? new Promise((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, signal) => resolve({ exitCode: code, signal }));
        })
      : closed;
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
    await stopProcessTree(child, closed, options.cleanupTimeoutMs ?? 5000);
  } catch (error) {
    report.cleanupFailure = error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
  return report;
}
