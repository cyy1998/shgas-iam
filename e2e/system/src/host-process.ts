import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout } from "node:timers/promises";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import { runWithCleanup } from "./bounded-operation.ts";

interface HostProcessOptions {
  service: string;
  cwd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  origin: string;
  healthPath: string;
  healthStatus?: number;
  logDirectory: string;
  signal?: AbortSignal;
}

export async function startHostProcess(options: HostProcessOptions) {
  options.signal?.throwIfAborted();
  const stdout = join(options.logDirectory, `${options.service}.stdout.log`);
  const stderr = join(options.logDirectory, `${options.service}.stderr.log`);
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["--no-env-file", ...options.args],
    cwd: options.cwd,
    env: options.env,
  });
  const stopSignal = new AbortController();
  const finished = waitForOwnedProcessTree(child, {
    signal: stopSignal.signal,
    forceAfterMs: 3_000,
    cleanupTimeoutMs: 5_000,
  });
  const output = Promise.allSettled([
    pipeline(child.stdout, createWriteStream(stdout, { flags: "a", mode: 0o600 })),
    pipeline(child.stderr, createWriteStream(stderr, { flags: "a", mode: 0o600 })),
  ]);
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopSignal.abort();
    stopping ??= finishStop();
    return stopping;
  };
  async function finishStop() {
    const report = await finished;
    if (report.cleanupFailure) {
      child.stdout.destroy();
      child.stderr.destroy();
    }
    const failures = (await output).flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (report.cleanupFailure) failures.push(report.cleanupFailure);
    if (failures.length) throw new AggregateError(failures, `E2E ${options.service} cleanup or log write failed`);
  }

  const deadline = AbortSignal.timeout(30_000);
  const startup = new AbortController();
  const signal = AbortSignal.any([deadline, startup.signal, ...(options.signal ? [options.signal] : [])]);
  try {
    await Promise.race([
      waitForHealth(options, signal),
      finished.then((report) => {
        throw new Error(`${options.service} exited before readiness (exit ${report.outcome?.exitCode ?? "unknown"})`, {
          cause: report.executionFailure?.error,
        });
      }),
    ]);
    signal.throwIfAborted();
    return { stop };
  } catch (error) {
    return await runWithCleanup(async () => {
      if (options.signal?.aborted) throw options.signal.reason;
      throw new Error(`E2E ${options.service} did not become ready at ${options.origin}; see ${stderr} and ${stdout}`, {
        cause: error,
      });
    }, stop);
  } finally {
    startup.abort();
  }
}

async function waitForHealth(options: HostProcessOptions, signal: AbortSignal) {
  const url = new URL(options.healthPath, options.origin);
  while (true) {
    signal.throwIfAborted();
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(1_000)]),
      headers: { "X-IAM-Entry-Network": "internal", connection: "close" },
    }).catch(() => undefined);
    await response?.body?.cancel();
    if (response?.status === (options.healthStatus ?? 200)) return;
    await setTimeout(50, undefined, { signal });
  }
}
