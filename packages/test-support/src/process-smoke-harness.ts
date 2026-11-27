import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type OwnedProcessTree, spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import { runWithOwnedTestResources } from "./external-test-resources";

export { spawnOwnedProcessTree };
export const PROCESS_SMOKE_TEST_TIMEOUT_MS = 45_000;

export function createProcessSmokeEnvironment(options: {
  source: NodeJS.ProcessEnv;
  temporaryDirectory: string;
  overrides: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const inherited = ["PATH", "LD_LIBRARY_PATH", "IAM_OWNED_PROCESS_MARKERS"];
  return {
    ...Object.fromEntries(inherited.map((key) => [key, options.source[key]])),
    ...options.overrides,
    TMPDIR: options.temporaryDirectory,
  };
}

export async function withOwnedTemporaryDirectory<T>(options: {
  prefix: string;
  run: (directory: string) => Promise<T>;
}) {
  if (!options.prefix || /[\\/]/u.test(options.prefix)) throw new Error("Invalid temporary directory prefix");
  return await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const directory = await mkdtemp(join(tmpdir(), options.prefix));
    registerCleanup(() => rm(directory, { force: true, recursive: true }));
    return await options.run(directory);
  });
}

export async function allocateLoopbackPort(hostname: string) {
  const reservation = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, hostname, resolve);
    });
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Unable to reserve a loopback port");
    return address.port;
  } finally {
    if (reservation.listening) await new Promise<void>((resolve) => reservation.close(() => resolve()));
  }
}

export function captureProcessOutput(child: OwnedProcessTree, maxLength = 64 * 1024) {
  let output = "";
  for (const stream of ["stdout", "stderr"] as const) {
    child[stream].setEncoding("utf8").on("data", (chunk: string) => {
      output = (output + chunk).slice(-maxLength);
    });
  }
  return () => output;
}

export function startProcess(child: OwnedProcessTree, options: { timeoutMs?: number; maxOutputBytes?: number } = {}) {
  const output = captureProcessOutput(child, options.maxOutputBytes);
  const abort = new AbortController();
  const completed = waitForOwnedProcessTree(child, { signal: abort.signal, timeoutMs: options.timeoutMs });
  return {
    child,
    output,
    completed,
    async stop() {
      abort.abort();
      const report = await completed;
      if (report.cleanupFailure) throw new Error(output(), { cause: report.cleanupFailure });
    },
  };
}

export async function runCommand(options: {
  label: string;
  start: () => OwnedProcessTree;
  completionTimeoutMs?: number;
  expectedExitCode?: number;
  maxOutputBytes?: number;
}) {
  const running = startProcess(options.start(), {
    timeoutMs: options.completionTimeoutMs ?? 15_000,
    maxOutputBytes: options.maxOutputBytes,
  });
  const { outcome, executionFailure, cleanupFailure } = await running.completed;
  const output = running.output();
  if (executionFailure || cleanupFailure || outcome?.exitCode !== (options.expectedExitCode ?? 0))
    throw new Error(`${options.label} exited with ${outcome?.exitCode ?? outcome?.signal ?? "no status"}\n${output}`, {
      cause: new AggregateError([executionFailure?.error, cleanupFailure].filter(Boolean)),
    });
  return { exitCode: outcome.exitCode, output };
}

export type ProcessContext = { hostname: string; port: number; temporaryDirectory: string };

export async function waitForReadiness<T>(
  running: ReturnType<typeof startProcess>,
  probe: (signal: AbortSignal) => Promise<T | undefined>,
  evidence: string,
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
  const poll = async () => {
    while (!signal.aborted) {
      if (running.output().includes(evidence)) {
        try {
          const result = await probe(signal);
          if (result !== undefined) return result;
        } catch (error) {
          if (!(error instanceof TypeError) && !signal.aborted) throw error;
        }
      }
      await delay(25, undefined, { signal });
    }
    return undefined;
  };
  try {
    const result = await Promise.race([poll(), running.completed.then(() => undefined)]).catch((error) => {
      if (!signal.aborted) throw error;
      return undefined;
    });
    if (result === undefined)
      throw new Error(`Process did not reach readiness
${running.output()}`);
    return result;
  } finally {
    controller.abort();
  }
}

export async function withReadyProcess<T>(options: {
  label: string;
  temporaryDirectoryPrefix: string;
  hostname?: string;
  start: (context: ProcessContext) => OwnedProcessTree;
  probe: (context: ProcessContext, signal: AbortSignal) => Promise<T | undefined>;
  childReadinessEvidence?: string | ((context: ProcessContext) => string);
  stop?: (child: OwnedProcessTree) => Promise<void>;
}) {
  return await withOwnedTemporaryDirectory({
    prefix: options.temporaryDirectoryPrefix,
    async run(temporaryDirectory) {
      const hostname = options.hostname ?? "127.0.0.1";
      const context = { hostname, port: await allocateLoopbackPort(hostname), temporaryDirectory };
      return await runWithOwnedTestResources(async ({ registerCleanup }) => {
        const running = startProcess(options.start(context));
        registerCleanup(running.stop);
        const evidence = options.childReadinessEvidence;
        const result = await waitForReadiness(
          running,
          (signal) => options.probe(context, signal),
          typeof evidence === "function" ? evidence(context) : (evidence ?? ""),
        );
        if (options.stop) {
          await options.stop(running.child);
        } else {
          running.child.kill("SIGTERM");
          const report = await Promise.race([running.completed, delay(5000, undefined, { ref: false })]);
          if (report?.outcome?.exitCode !== 0)
            throw new Error(`${options.label} failed to stop cleanly\n${running.output()}`);
        }
        return result;
      });
    },
  });
}
