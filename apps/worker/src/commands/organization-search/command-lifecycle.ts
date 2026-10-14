export async function runOrganizationSearchCommandWithLifecycle<T>(input: {
  run: (signal: AbortSignal) => Promise<T>;
  shutdown: (reason: string) => Promise<void>;
  deadlineMs: number;
}) {
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  function abort(reason: string) {
    controller.abort(new Error(reason));
    closing ??= input.shutdown(reason);
    // Awaited in finally; prevent a premature unhandled rejection while the operation unwinds.
    void closing.catch(() => {});
  }
  const onInterrupt = () => {
    process.exitCode = 130;
    abort("SIGINT");
  };
  const onTerminate = () => {
    process.exitCode = 143;
    abort("SIGTERM");
  };
  const timer = setTimeout(() => abort("deadline"), input.deadlineMs);
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  let completed = false;
  try {
    const result = await input.run(controller.signal);
    controller.signal.throwIfAborted();
    completed = true;
    return result;
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    await (closing ?? input.shutdown(completed ? "command-completed" : "command-failed"));
  }
}

export function parseOrganizationCommandDeadline(value: string | undefined) {
  const deadlineMs = value === undefined ? 30_000 : Number(value);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300_000)
    throw new RangeError("deadline-ms must be between 1 and 300000");
  return deadlineMs;
}
