import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const commandEnvironmentKey = "IAM_OWNED_PROCESS_COMMAND_BASE64";
const processMarkersEnvironmentKey = "IAM_OWNED_PROCESS_MARKERS";
const scopeIdKey = "IAM_OWNED_PROCESS_SCOPE_ID";
const scopeFileKey = "IAM_OWNED_PROCESS_SCOPE_FILE";
const scopeIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const launcherPath = fileURLToPath(new URL("./windows-job-launcher.mjs", import.meta.url));
const supervisorPath = fileURLToPath(new URL("./windows-job-supervisor.ps1", import.meta.url));
const powershell = join(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
const powershellOptions = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"];
const execute = promisify(execFile);

export function ownedProcessScopeEnvironment(scope, env = process.env) {
  if (!scopeIdPattern.test(scope.id) || typeof scope.activeFile !== "string" || !isAbsolute(scope.activeFile)) {
    throw new Error("Invalid owned process scope");
  }
  return { ...env, [scopeIdKey]: scope.id, [scopeFileKey]: scope.activeFile };
}

/** Join only the previous scope after its launch permit has been revoked. */
export async function closeOwnedProcessScope(id, options) {
  if (!scopeIdPattern.test(id)) throw new Error("Invalid owned process scope identity");
  if (process.platform === "win32") {
    await execute(
      powershell,
      [
        ...powershellOptions,
        supervisorPath,
        "-RecoverScope",
        id,
        "-GraceMs",
        String(options.forceAfterMs),
        "-TimeoutMs",
        String(options.timeoutMs),
      ],
      { windowsHide: true, timeout: options.timeoutMs + 5_000 },
    );
  } else if (process.platform === "linux") {
    await closePosixOwnedProcesses(() => linuxOwnedProcesses(id, scopeIdKey), options, true);
  } else if (process.platform === "darwin") {
    await closePosixOwnedProcesses(() => macOwnedProcesses(id), options, true);
  } else {
    throw new Error(`Cannot verify owned process scope on ${process.platform}`);
  }
}

function inheritedMarkers(value) {
  if (!value) return [];
  const markers = JSON.parse(value);
  if (!Array.isArray(markers) || markers.some((marker) => typeof marker !== "string"))
    throw new Error("Invalid owned process ancestry");
  return markers;
}

async function linuxOwnedProcesses(marker, key = processMarkersEnvironmentKey) {
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
        const variable = environment.split("\0").find((value) => value.startsWith(`${key}=`));
        if (!variable) return undefined;
        const value = variable.slice(key.length + 1);
        if (key === scopeIdKey) return value === marker ? Number(entry) : undefined;
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

async function macOwnedProcesses(id) {
  // Keep ps output private: same-user environments can contain unrelated credentials.
  const { stdout } = await execute("/bin/ps", ["-Eww", "-x", "-U", String(process.getuid()), "-o", "pid=,command="], {
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 1_000,
  }).catch(() => {
    throw new Error("Could not inspect the owned macOS process scope");
  });
  const marker = `${scopeIdKey}=${id}`;
  return stdout.split("\n").flatMap((line) => {
    const pid = Number(/^\s*(\d+)\s/u.exec(line)?.[1]);
    return Number.isInteger(pid) && pid > 0 && pid !== process.pid && line.split(" ").includes(marker) ? [pid] : [];
  });
}

async function closePosixOwnedProcesses(findProcesses, options, confirmEmpty = false) {
  const started = performance.now();
  const forceAfterMs =
    options.forceAfterMs === undefined
      ? Math.min(250, options.timeoutMs / 2)
      : Math.min(options.forceAfterMs, options.timeoutMs * 0.8);
  const signaled = new Set();
  let empty = false;
  while (true) {
    const processes = await findProcesses();
    if (processes.length === 0 && (!confirmEmpty || empty)) return;
    empty = processes.length === 0;
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

/**
 * Node/Bun 共用的进程树所有权；Windows Job 在主进程正常退出后也关闭其遗留执行者。
 * Linux 使用继承的 IAM_OWNED_PROCESS_MARKERS 精确停止 detached 后代；显式子进程 env 保留该内部 ancestry。
 */
export function spawnOwnedProcessTree(options) {
  const windows = process.platform === "win32";
  const linux = process.platform === "linux";
  const scopeId = options.env[scopeIdKey] ?? process.env[scopeIdKey];
  const scopeFile = options.env[scopeFileKey] ?? process.env[scopeFileKey];
  const scopedEnv =
    scopeId === undefined
      ? options.env
      : ownedProcessScopeEnvironment({ id: scopeId, activeFile: scopeFile }, options.env);
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
  const gated = !windows && scopeId !== undefined;
  const child = spawn(
    windows ? powershell : gated ? "/bin/sh" : options.executable,
    windows
      ? [
          ...powershellOptions,
          options.windowsJob?.supervisorPath ?? supervisorPath,
          "-NodeExecutable",
          options.windowsJob?.launcherExecutable ?? process.execPath,
          "-LauncherPath",
          options.windowsJob?.launcherExecutable ?? launcherPath,
          "-RuntimeKind",
          options.windowsJob ? "executable" : process.versions.bun === undefined ? "node" : "bun",
        ]
      : gated
        ? [
            "-c",
            'test -f "$1" || exit 125; shift; exec "$@"',
            "iam-owned-scope",
            scopeFile,
            options.executable,
            ...options.args,
          ]
        : options.args,
    {
      cwd: options.cwd,
      env: windows
        ? { ...scopedEnv, [commandEnvironmentKey]: command }
        : linux
          ? { ...scopedEnv, [processMarkersEnvironmentKey]: JSON.stringify(ancestry) }
          : scopedEnv,
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
      value: (cleanupOptions) => closePosixOwnedProcesses(() => linuxOwnedProcesses(marker), cleanupOptions),
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

async function stopProcessTree(child, closed, timeoutMs, forceAfterMs, requestGracefulStop) {
  if (!child.pid) return;
  const deadline = performance.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - performance.now());
  const waitForClose = () => bounded(closed, remaining(), "Process tree did not close before its cleanup deadline");
  if (child.closeOwnedProcessTree) {
    await child.closeOwnedProcessTree({ timeoutMs: remaining(), forceAfterMs });
  } else if (process.platform === "win32") {
    let gracefulFailure;
    if (requestGracefulStop && child.exitCode === null && child.signalCode === null) {
      const grace = Math.min(forceAfterMs ?? 500, timeoutMs * 0.8);
      const graceDeadline = performance.now() + grace;
      try {
        await bounded(Promise.resolve().then(requestGracefulStop), grace, "Windows shutdown request timed out");
      } catch (error) {
        gracefulFailure = error;
      }
      if (!gracefulFailure) await waitForGracefulClose(closed, Math.max(0, graceDeadline - performance.now()));
    }
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
    await waitForClose();
    if (gracefulFailure) throw gracefulFailure;
    return;
  } else {
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    killGroup("SIGTERM");
    await waitForGracefulClose(closed, Math.min(remaining(), forceAfterMs ?? 500));
    killGroup("SIGKILL");
  }
  await waitForClose();
}

async function waitForGracefulClose(closed, timeoutMs) {
  let timer;
  try {
    await Promise.race([
      closed,
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
    const didFail = report.executionFailure ? report.executionFailure.kind !== "abort" : report.outcome.exitCode !== 0;
    if (didFail) options.onExecutionFailure?.();
  } finally {
    try {
      await stopProcessTree(
        child,
        closed,
        options.cleanupTimeoutMs ?? 5000,
        options.forceAfterMs,
        options.requestGracefulStop,
      );
    } catch (error) {
      report.cleanupFailure = error;
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  return report;
}
