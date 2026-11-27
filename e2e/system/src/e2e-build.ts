import { captureCommand } from "./command-runner.ts";
import { e2eLocalImageTag } from "./e2e-compose.ts";

export const defaultE2EBuildConcurrency = 2;
export const maxE2EBuildConcurrency = 4;

export function parseE2EBuildConcurrency(value: string | undefined, option = "IAM_E2E_BUILD_CONCURRENCY"): number {
  if (value === undefined || value.trim() === "") return defaultE2EBuildConcurrency;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^[1-9]\d*$/u.test(trimmed) || !Number.isSafeInteger(parsed) || parsed > maxE2EBuildConcurrency) {
    throw new Error(`${option} requires an integer from 1 to ${maxE2EBuildConcurrency}`);
  }
  return parsed;
}

export interface E2EBuildOutcome {
  service: string;
  durationMs: number;
  logPath: string;
}

export async function buildE2EImages(options: {
  services: readonly string[];
  concurrency: number;
  signal: AbortSignal;
  buildOne: (service: string, signal: AbortSignal) => Promise<{ logPath: string }>;
}): Promise<E2EBuildOutcome[]> {
  const { services, concurrency, signal, buildOne } = options;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > maxE2EBuildConcurrency) {
    throw new Error(`Build concurrency requires an integer from 1 to ${maxE2EBuildConcurrency}`);
  }
  if (services.length === 0) return [];

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(signal.reason ?? new Error("E2E image build aborted"));
  if (signal.aborted) onExternalAbort();
  else signal.addEventListener("abort", onExternalAbort, { once: true });

  const canceledAfterFailure = new Error("E2E image build canceled after another image failed");
  const outcomes = new Map<string, E2EBuildOutcome>();
  const failures: Error[] = [];
  let next = 0;

  async function worker() {
    while (!controller.signal.aborted && next < services.length) {
      const service = services[next++]!;
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
    const slots = Math.min(services.length, concurrency);
    await Promise.all(Array.from({ length: slots }, worker));
  } finally {
    signal.removeEventListener("abort", onExternalAbort);
  }

  if (failures.length === 1) throw failures[0]!;
  if (failures.length > 1) throw new AggregateError(failures, "E2E image builds failed");
  signal.throwIfAborted();
  return services.map((service) => outcomes.get(service)!);
}

export async function ensureLocalE2EImages(
  services: readonly string[],
  options: {
    cwd: string;
    signal?: AbortSignal;
    inspect?: (tag: string, signal?: AbortSignal) => Promise<boolean>;
  },
) {
  const inspect =
    options.inspect ??
    (async (tag: string, signal?: AbortSignal) => {
      try {
        await captureCommand("docker", ["image", "inspect", "--format", "{{.Id}}", tag], {
          cwd: options.cwd,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        });
        return true;
      } catch {
        return false;
      }
    });
  const missing: string[] = [];
  for (const service of services) {
    options.signal?.throwIfAborted();
    const tag = e2eLocalImageTag(service);
    if (!(await inspect(tag, options.signal))) missing.push(tag);
  }
  if (missing.length > 0) {
    throw new Error(
      `--skip-build requires prebuilt local E2E images; missing: ${missing.join(", ")}. Run pnpm test:e2e without --skip-build first.`,
    );
  }
}
