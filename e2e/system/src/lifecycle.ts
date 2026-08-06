import { runBoundedOperation } from "./bounded-operation.ts";

export interface RunDescriptor {
  version: 1;
  runId: string;
  project: string;
  gatewayPort: number;
  origin: string;
  artifactDirectory: string;
  labels: {
    "com.docker.compose.project": string;
    "com.shgas-iam.e2e.run-id": string;
  };
}

export interface ExactProjectInfraLifecycle {
  preflight: (signal?: AbortSignal) => Promise<unknown>;
  createDescriptor: () => Promise<RunDescriptor>;
  persistDescriptor: (descriptor: RunDescriptor) => Promise<unknown>;
  initializeMigrationReceipt: (
    descriptor: RunDescriptor,
  ) => Promise<unknown>;
  startHealthyInfrastructure: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  runMigrations: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  cleanup: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

export interface ExactProjectRuntimeLifecycle extends ExactProjectInfraLifecycle {
  prepareDiagnostics: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  startRepoRuntimes: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  verifyCanonicalOriginConfiguration: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  seedE2EScenario: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  renderGatewayRoutes: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  awaitGatewayRouteReadiness: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  collectDiagnostics: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

export interface ExactProjectJourneyLifecycle
  extends ExactProjectRuntimeLifecycle {
  runJourney: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

export interface RuntimeLifecycleOptions {
  abortSettleTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  diagnosticsTimeoutMs?: number;
  preflightTimeoutMs?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const defaultDiagnosticsTimeoutMs = 30_000;
const defaultCleanupTimeoutMs = 120_000;
const defaultPreflightTimeoutMs = 60_000;

export async function runExactProjectRuntimeLifecycle(
  lifecycle: ExactProjectRuntimeLifecycle,
  options: RuntimeLifecycleOptions = {},
) {
  return runRuntimeLifecycle(lifecycle, options);
}

export async function runExactProjectJourneyLifecycle(
  lifecycle: ExactProjectJourneyLifecycle,
  options: RuntimeLifecycleOptions = {},
) {
  return runRuntimeLifecycle(
    lifecycle,
    options,
    (descriptor, signal) => lifecycle.runJourney(descriptor, signal),
  );
}

async function runRuntimeLifecycle(
  lifecycle: ExactProjectRuntimeLifecycle,
  options: RuntimeLifecycleOptions,
  runJourney?: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>,
) {
  const preflightTimeoutMs = options.preflightTimeoutMs
    ?? defaultPreflightTimeoutMs;
  await runBoundedOperation(signal => lifecycle.preflight(signal), {
    abortSettleTimeoutMs: options.abortSettleTimeoutMs,
    parentSignal: options.signal,
    timeoutMessage: `E2E preflight timed out after ${preflightTimeoutMs}ms`,
    timeoutMs: preflightTimeoutMs,
  });
  const descriptor = await lifecycle.createDescriptor();
  await lifecycle.persistDescriptor(descriptor);
  await lifecycle.initializeMigrationReceipt(descriptor);

  let failure: unknown;
  let failed = false;
  try {
    await runBoundedOperation(async (signal) => {
      await lifecycle.prepareDiagnostics(descriptor, signal);
      await lifecycle.startHealthyInfrastructure(descriptor, signal);
      await lifecycle.runMigrations(descriptor, signal);
      await lifecycle.startRepoRuntimes(descriptor, signal);
      await lifecycle.verifyCanonicalOriginConfiguration(descriptor, signal);
      await lifecycle.seedE2EScenario(descriptor, signal);
      await lifecycle.renderGatewayRoutes(descriptor, signal);
      await lifecycle.awaitGatewayRouteReadiness(descriptor, signal);
      await runJourney?.(descriptor, signal);
    }, {
      abortSettleTimeoutMs: options.abortSettleTimeoutMs,
      parentSignal: options.signal,
      timeoutMessage: options.timeoutMs === undefined
        ? undefined
        : `E2E runtime readiness timed out after ${options.timeoutMs}ms`,
      timeoutMs: options.timeoutMs,
    });
  }
  catch (error) {
    failed = true;
    failure = error;
  }

  try {
    const timeoutMs = options.diagnosticsTimeoutMs ?? defaultDiagnosticsTimeoutMs;
    await runBoundedOperation(
      signal => lifecycle.collectDiagnostics(descriptor, signal),
      {
        abortSettleTimeoutMs: options.abortSettleTimeoutMs,
        timeoutMessage: `E2E diagnostic collection timed out after ${timeoutMs}ms`,
        timeoutMs,
      },
    );
  }
  catch (diagnosticsFailure) {
    if (failed) {
      failure = new AggregateError(
        [failure, diagnosticsFailure],
        "E2E runtime failed and diagnostic collection also failed",
      );
    }
    else {
      failed = true;
      failure = diagnosticsFailure;
    }
  }

  try {
    const timeoutMs = options.cleanupTimeoutMs ?? defaultCleanupTimeoutMs;
    await runBoundedOperation(
      signal => lifecycle.cleanup(descriptor, signal),
      {
        abortSettleTimeoutMs: options.abortSettleTimeoutMs,
        timeoutMessage: `E2E exact-project cleanup timed out after ${timeoutMs}ms`,
        timeoutMs,
      },
    );
  }
  catch (cleanupFailure) {
    if (failed) {
      const errors = failure instanceof AggregateError
        ? [...failure.errors, cleanupFailure]
        : [failure, cleanupFailure];
      throw new AggregateError(
        errors,
        "E2E run failed and exact-project cleanup also failed",
      );
    }
    throw cleanupFailure;
  }

  if (!failed && options.signal?.aborted) {
    failed = true;
    failure = options.signal.reason ?? new Error("E2E runtime run aborted");
  }
  if (failed)
    throw failure;
  return descriptor;
}
