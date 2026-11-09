/** A failed required shutdown cannot be treated as a completed maintenance round. */
export class MaintenanceCommandCleanupError extends AggregateError {
  constructor(errors: unknown[]) {
    super(errors, "Maintenance command cleanup failed");
    this.name = "MaintenanceCommandCleanupError";
  }
}

/** Resources and optional process signal ownership are explicitly supplied by the app. */
export async function runMaintenanceCommandWithLifecycle<T>(input: {
  run: (signal: AbortSignal) => Promise<T>;
  shutdown: (reason: string) => Promise<void>;
  deadlineMs: number;
  signals?: Pick<NodeJS.Process, "once" | "off" | "exitCode">;
}): Promise<T> {
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  function abort(reason: string) {
    if (controller.signal.aborted) return;
    controller.abort(new Error(reason));
    closing ??= Promise.resolve().then(() => input.shutdown(reason));
    // The operation unwinds before finally observes the shutdown result.
    void closing.catch(() => {});
  }
  const onInterrupt = () => {
    if (input.signals) input.signals.exitCode = 130;
    abort("SIGINT");
  };
  const onTerminate = () => {
    if (input.signals) input.signals.exitCode = 143;
    abort("SIGTERM");
  };
  const timer = setTimeout(() => abort("deadline"), input.deadlineMs);
  input.signals?.once("SIGINT", onInterrupt);
  input.signals?.once("SIGTERM", onTerminate);
  let outcome: { ok: true; result: T } | { ok: false; error: unknown };
  try {
    const result = await input.run(controller.signal);
    controller.signal.throwIfAborted();
    outcome = { ok: true, result };
  } catch (error) {
    outcome = { ok: false, error };
  } finally {
    clearTimeout(timer);
    input.signals?.off("SIGINT", onInterrupt);
    input.signals?.off("SIGTERM", onTerminate);
  }
  try {
    await (closing ?? input.shutdown(outcome.ok ? "command-completed" : "command-failed"));
  } catch (error) {
    throw new MaintenanceCommandCleanupError(outcome.ok ? [error] : [outcome.error, error]);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
