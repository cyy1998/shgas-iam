export const defaultContainerSmokeBuildConcurrency = 2;
export const maxContainerSmokeBuildConcurrency = 4;

const preferredBuildOrder = ["apisix", "admin", "api", "sso", "admin-api", "worker", "gateway-api"];

export function parseContainerSmokeBuildConcurrency(
  value: string | undefined,
  option = "IAM_CONTAINER_SMOKE_BUILD_CONCURRENCY",
): number {
  if (value === undefined || value.trim() === "") return defaultContainerSmokeBuildConcurrency;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^[1-9]\d*$/u.test(trimmed) || !Number.isSafeInteger(parsed) || parsed > maxContainerSmokeBuildConcurrency) {
    throw new Error(`${option} requires an integer from 1 to ${maxContainerSmokeBuildConcurrency}`);
  }
  return parsed;
}

export function orderContainerSmokeBuildServices(services: readonly string[]): string[] {
  const rank = (service: string) => {
    const index = preferredBuildOrder.indexOf(service);
    return index === -1 ? preferredBuildOrder.length : index;
  };
  return [...services].sort((left, right) => rank(left) - rank(right));
}

export interface ContainerSmokeBuildOutcome {
  service: string;
  durationMs: number;
  logPath: string;
}

export async function buildContainerSmokeImages(options: {
  services: readonly string[];
  concurrency: number;
  signal: AbortSignal;
  buildOne: (service: string, signal: AbortSignal) => Promise<{ logPath: string }>;
}): Promise<ContainerSmokeBuildOutcome[]> {
  const { concurrency, signal, buildOne } = options;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > maxContainerSmokeBuildConcurrency) {
    throw new Error(`Build concurrency requires an integer from 1 to ${maxContainerSmokeBuildConcurrency}`);
  }
  const ordered = orderContainerSmokeBuildServices(options.services);
  if (ordered.length === 0) return [];

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(signal.reason ?? new Error("Container Smoke build aborted"));
  if (signal.aborted) onExternalAbort();
  else signal.addEventListener("abort", onExternalAbort, { once: true });

  const canceledAfterFailure = new Error("Container Smoke build canceled after another image failed");
  const outcomes = new Map<string, ContainerSmokeBuildOutcome>();
  const failures: Error[] = [];
  let next = 0;

  async function worker() {
    while (!controller.signal.aborted && next < ordered.length) {
      const service = ordered[next++]!;
      const started = performance.now();
      try {
        const { logPath } = await buildOne(service, controller.signal);
        outcomes.set(service, { service, durationMs: Math.round(performance.now() - started), logPath });
      } catch (error) {
        if (error !== canceledAfterFailure && !(controller.signal.aborted && error === controller.signal.reason)) {
          failures.push(error instanceof Error ? error : new Error(String(error)));
        }
        if (!controller.signal.aborted) controller.abort(canceledAfterFailure);
      }
    }
  }

  try {
    const slots = Math.min(ordered.length, concurrency);
    await Promise.all(Array.from({ length: slots }, worker));
  } finally {
    signal.removeEventListener("abort", onExternalAbort);
  }

  if (failures.length === 1) throw failures[0]!;
  if (failures.length > 1) throw new AggregateError(failures, "Container Smoke image builds failed");
  signal.throwIfAborted();
  return ordered.map((service) => outcomes.get(service)!);
}
