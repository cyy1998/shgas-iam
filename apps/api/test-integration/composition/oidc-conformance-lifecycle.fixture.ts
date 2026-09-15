interface SignalSource {
  on: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
  removeListener: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
}

export interface OidcConformanceLifecycle {
  signal: AbortSignal;
  own: (cleanup: () => unknown | Promise<unknown>) => void;
  checkpoint: (phase: string) => Promise<void>;
}

export async function runConformanceCleanup(cleanup: () => unknown | Promise<unknown>, timeoutMs = 10000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("OIDC conformance cleanup exceeded its deadline")),
          timeoutMs,
        );
      }),
    ]);
  }
  finally {
    clearTimeout(timer);
  }
}

/** Own signals before setup; repeated signals never replace the cleanup path with process exit. */
export async function withOidcConformanceLifecycle<T>(
  work: (lifecycle: OidcConformanceLifecycle) => Promise<T>,
  options: {
    signals?: SignalSource;
    observePhase?: (phase: string) => void;
    cleanupTimeoutMs?: number;
  } = {},
) {
  const signals = options.signals ?? process;
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("OIDC conformance interrupted"));
  const cleanups: (() => unknown | Promise<unknown>)[] = [];
  const failures: unknown[] = [];
  let value: T | undefined;
  signals.on("SIGINT", interrupt);
  signals.on("SIGTERM", interrupt);
  try {
    try {
      value = await work({
        signal: controller.signal,
        own: cleanup => cleanups.push(cleanup),
        async checkpoint(phase) {
          options.observePhase?.(phase);
          controller.signal.throwIfAborted();
        },
      });
    }
    catch (error) {
      failures.push(error);
    }
    for (const cleanup of cleanups.reverse()) {
      try {
        await runConformanceCleanup(async () => {
          try {
            options.observePhase?.("cleanup");
          }
          finally {
            await cleanup();
          }
        }, options.cleanupTimeoutMs);
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (controller.signal.aborted && !failures.includes(controller.signal.reason))
      failures.push(controller.signal.reason);
  }
  finally {
    signals.removeListener("SIGINT", interrupt);
    signals.removeListener("SIGTERM", interrupt);
  }
  if (failures.length)
    throw new AggregateError(failures, "OIDC conformance execution or cleanup failed");
  return value!;
}
