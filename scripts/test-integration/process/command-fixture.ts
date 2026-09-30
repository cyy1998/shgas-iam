import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  spawnOwnedProcessTree,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";

// Reserve time after the scenario deadline for tree and directory cleanup.
export const COMMAND_FIXTURE_TEST_TIMEOUT_MS = 30_000;
const scenarioTimeoutMs = 18_000;
const cleanupTimeoutMs = 5_000;

export async function runOwnedCommand(command: string[], cwd: string, signal: AbortSignal, timeoutMs = 20_000) {
  signal.throwIfAborted();
  const executable = command[0];
  if (executable === undefined) throw new Error("command must contain an executable");
  const child = spawnOwnedProcessTree({
    executable,
    args: command.slice(1),
    cwd,
    env: createProcessSmokeEnvironment({
      source: process.env,
      temporaryDirectory: cwd,
      overrides: { FORCE_COLOR: "0", NO_COLOR: "1" },
    }),
  });
  const capture = createBoundedProcessLogCapture(child, { maxBytes: 64 * 1024 });
  let dispose = () => {};
  let outcome: { exitCode: number; output: string } | undefined;
  const failures: unknown[] = [];
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      const onClose = (code: number | null, exitSignal: NodeJS.Signals | null) => {
        if (code === null || exitSignal !== null) reject(new Error(`command exited with signal ${exitSignal}`));
        else resolve(code);
      };
      const onAbort = () => reject(signal.reason);
      const timer = setTimeout(() => reject(new Error(`command deadline exceeded after ${timeoutMs}ms`)), timeoutMs);
      child.on("error", onError);
      child.once("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
      dispose = () => {
        clearTimeout(timer);
        child.off("error", onError);
        child.off("close", onClose);
        signal.removeEventListener("abort", onAbort);
      };
      if (signal.aborted) onAbort();
    });
    outcome = { exitCode, output: capture.snapshot() };
  } catch (error) {
    failures.push(new Error(`command failed: ${command.join(" ")}\n${capture.snapshot()}`, { cause: error }));
  }
  try {
    await terminateProcessTree(child, { timeoutMs: cleanupTimeoutMs });
  } catch (error) {
    failures.push(new Error(`command tree cleanup failed\n${capture.snapshot()}`, { cause: error }));
  } finally {
    dispose();
    capture.dispose();
  }
  if (failures.length > 1) throw new AggregateError(failures, "command and process tree cleanup both failed");
  if (failures.length === 1) throw failures[0];
  if (outcome === undefined) throw new Error("command completed without an outcome");
  return outcome;
}

export async function withCommandFixture<T>(prefix: string, run: (root: string, signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let interruptedSignal: "SIGINT" | "SIGTERM" | undefined;
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    interruptedSignal ??= signal;
    controller.abort(new Error(`command fixture interrupted by ${signal}`));
  };
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  const timer = setTimeout(
    () => controller.abort(new Error(`command fixture deadline exceeded after ${scenarioTimeoutMs}ms`)),
    scenarioTimeoutMs,
  );
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    return await withOwnedTemporaryDirectory({
      prefix,
      cleanupTimeoutMs,
      async run(root) {
        controller.signal.throwIfAborted();
        const result = await run(root, controller.signal);
        controller.signal.throwIfAborted();
        return result;
      },
    });
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    // Restore the runner's termination semantics only after both owned cleanups settle.
    if (interruptedSignal !== undefined) process.kill(process.pid, interruptedSignal);
  }
}
