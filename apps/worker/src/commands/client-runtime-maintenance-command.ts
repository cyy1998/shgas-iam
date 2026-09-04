const FULL_MAINTENANCE_TIMEOUT_ENV = "IAM_WORKER_CLIENT_RUNTIME_MAINTENANCE_TIMEOUT_MS";

export async function runBoundedClientRuntimeMaintenance<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "failed" }
> {
  requirePositiveSafeInteger(timeoutMs, "timeoutMs");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Client Runtime maintenance timed out")),
      timeoutMs,
    );
  });
  try {
    return {
      status: "completed",
      value: await Promise.race([operation(), deadline]),
    };
  }
  catch {
    return { status: "failed" };
  }
  finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
  }
}

export function emitClientRuntimeMaintenanceReport(
  report: object,
  reportSink: (serializedReport: string) => void,
) {
  try {
    reportSink(`${JSON.stringify(report)}\n`);
  }
  catch {}
}

export function clientRuntimeMaintenanceExitCode(
  report: { readonly status: "completed" | "failed" },
) {
  return report.status === "completed" ? 0 : 1;
}

export function resolveClientRuntimeFullMaintenanceTimeoutMs(
  source: Readonly<Record<string, string | undefined>>,
  defaultTimeoutMs: number,
) {
  const configured = source[FULL_MAINTENANCE_TIMEOUT_ENV];
  if (configured === undefined)
    return defaultTimeoutMs;
  if (!/^\d+$/u.test(configured))
    throw new Error(`${FULL_MAINTENANCE_TIMEOUT_ENV} must be a positive safe integer`);
  const timeoutMs = Number(configured);
  requirePositiveSafeInteger(timeoutMs, FULL_MAINTENANCE_TIMEOUT_ENV);
  return timeoutMs;
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}
