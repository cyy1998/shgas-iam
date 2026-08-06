export interface BoundedOperationOptions {
  abortSettleTimeoutMs?: number;
  parentSignal?: AbortSignal;
  timeoutMessage?: string;
  timeoutMs?: number;
}

interface Settled<T> {
  error?: unknown;
  status: "fulfilled" | "rejected";
  value?: T;
}

const defaultAbortSettleTimeoutMs = 3_000;

export async function runBoundedOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: BoundedOperationOptions,
) {
  validatePositiveInteger(options.timeoutMs, "bounded operation timeout");
  validatePositiveInteger(options.abortSettleTimeoutMs, "abort settle timeout");
  const controller = new AbortController();
  const relayAbort = () => controller.abort(
    options.parentSignal?.reason ?? new Error("bounded operation aborted"),
  );
  if (options.parentSignal?.aborted)
    relayAbort();
  else
    options.parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = options.timeoutMs === undefined
    ? undefined
    : setTimeout(() => controller.abort(new Error(
        options.timeoutMessage
        ?? `bounded operation timed out after ${options.timeoutMs}ms`,
      )), options.timeoutMs);
  const settled: Promise<Settled<T>> = Promise.resolve()
    .then(() => operation(controller.signal))
    .then(value => ({ status: "fulfilled" as const, value }))
    .catch(error => ({ error, status: "rejected" as const }));
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<undefined>((resolve) => {
    abortListener = () => resolve(undefined);
    controller.signal.addEventListener("abort", abortListener, { once: true });
  });
  const first = controller.signal.aborted
    ? undefined
    : await Promise.race([
        settled,
        aborted,
      ]);
  if (first !== undefined) {
    dispose();
    return unwrap(first);
  }
  await waitForSettlement(
    settled,
    options.abortSettleTimeoutMs ?? defaultAbortSettleTimeoutMs,
  );
  const reason = controller.signal.reason ?? new Error("bounded operation aborted");
  dispose();
  throw reason;

  function dispose() {
    if (timer !== undefined)
      clearTimeout(timer);
    if (abortListener !== undefined)
      controller.signal.removeEventListener("abort", abortListener);
    options.parentSignal?.removeEventListener("abort", relayAbort);
  }
}

function waitForSettlement<T>(settled: Promise<Settled<T>>, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void settled.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function unwrap<T>(settled: Settled<T>) {
  if (settled.status === "rejected")
    throw settled.error;
  return settled.value as T;
}

function validatePositiveInteger(value: number | undefined, name: string) {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0))
    throw new Error(`${name} must be a positive integer`);
}
