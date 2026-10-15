import { describe, expect, test } from "bun:test";
import type { ExactProjectRuntimeLifecycle, RunDescriptor } from "../lifecycle.ts";
import { runExactProjectJourneyLifecycle, runExactProjectRuntimeLifecycle } from "../lifecycle.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "run-contract-01",
  project: "iam-e2e-run-contract-01",
  gatewayPort: 43123,
  origin: "http://127.0.0.1:43123",
  artifactDirectory: "C:/tmp/iam-e2e/run-contract-01",
  labels: {
    "com.docker.compose.project": "iam-e2e-run-contract-01",
    "com.shgas-iam.e2e.run-id": "run-contract-01",
  },
};

function createRuntimeLifecycle(overrides: Partial<ExactProjectRuntimeLifecycle> = {}): ExactProjectRuntimeLifecycle {
  return {
    awaitGatewayRouteReadiness: async () => undefined,
    cleanup: async () => undefined,
    collectDiagnostics: async () => undefined,
    createDescriptor: async () => descriptor,
    initializeMigrationReceipt: async () => undefined,
    persistDescriptor: async () => undefined,
    preflight: async () => undefined,
    prepareDiagnostics: async () => undefined,
    renderGatewayRoutes: async () => undefined,
    runMigrations: async () => undefined,
    seedE2EScenario: async () => undefined,
    startHealthyInfrastructure: async () => undefined,
    startRepoRuntimes: async () => undefined,
    verifyUserProfileReadiness: async () => undefined,
    verifyCanonicalOriginConfiguration: async () => undefined,
    ...overrides,
  };
}

describe("exact-project runtime lifecycle", () => {
  test("bounds a hung preflight before descriptor or resource creation", async () => {
    const events: string[] = [];
    let preflightSignal: AbortSignal | undefined;

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        preflight: async (signal) => {
          events.push("preflight");
          preflightSignal = signal;
          await new Promise(() => undefined);
        },
        createDescriptor: async () => {
          events.push("descriptor");
          return descriptor;
        },
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => events.push("cleanup"),
        startHealthyInfrastructure: async () => events.push("resources"),
      }),
      {
        abortSettleTimeoutMs: 10,
        preflightTimeoutMs: 5,
      },
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toMatchObject({ message: expect.stringContaining("E2E preflight timed out after 5ms") });
    expect(preflightSignal?.aborted).toBe(true);
    expect(events).toEqual(["preflight"]);
  });

  test("stops before resources when the not-attempted receipt cannot be initialized", async () => {
    const events: string[] = [];
    const receiptFailure = new Error("receipt initialization failed");
    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        persistDescriptor: async () => events.push("descriptor"),
        initializeMigrationReceipt: async () => {
          events.push("receipt:not-attempted");
          throw receiptFailure;
        },
        prepareDiagnostics: async () => events.push("prepare"),
        startHealthyInfrastructure: async () => events.push("resources"),
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => events.push("cleanup"),
      }),
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(receiptFailure);
    expect(events).toEqual(["descriptor", "receipt:not-attempted"]);
  });

  test("seeds after runtime readiness and before canonical Gateway route probes", async () => {
    const events: string[] = [];

    const result = await runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        createDescriptor: async () => descriptor,
        preflight: async () => events.push("preflight"),
        persistDescriptor: async () => events.push("descriptor"),
        initializeMigrationReceipt: async () => events.push("receipt:not-attempted"),
        prepareDiagnostics: async (value) => events.push(`prepare:${value.project}`),
        startHealthyInfrastructure: async (value) => events.push(`infra:${value.project}`),
        runMigrations: async (value) => events.push(`migrate:${value.project}`),
        startRepoRuntimes: async (value) => events.push(`runtimes:${value.project}`),
        verifyCanonicalOriginConfiguration: async (value) => events.push(`origin:${value.origin}`),
        seedE2EScenario: async (value) => events.push(`seed:${value.runId}`),
        verifyUserProfileReadiness: async (value) => events.push(`profile-gates:${value.runId}`),
        renderGatewayRoutes: async (value) => events.push(`routes:${value.origin}`),
        awaitGatewayRouteReadiness: async (value) => events.push(`ready:${value.origin}`),
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async (value) => events.push(`cleanup:${value.project}`),
      }),
    );

    expect(result).toEqual(descriptor);
    expect(events).toEqual([
      "preflight",
      "descriptor",
      "receipt:not-attempted",
      "prepare:iam-e2e-run-contract-01",
      "infra:iam-e2e-run-contract-01",
      "migrate:iam-e2e-run-contract-01",
      "runtimes:iam-e2e-run-contract-01",
      "origin:http://127.0.0.1:43123",
      "seed:run-contract-01",
      "profile-gates:run-contract-01",
      "routes:http://127.0.0.1:43123",
      "ready:http://127.0.0.1:43123",
      "diagnostics",
      "cleanup:iam-e2e-run-contract-01",
    ]);
  });

  test("runs a browser journey only after canonical Gateway routes are ready", async () => {
    const events: string[] = [];

    const result = await runExactProjectJourneyLifecycle({
      ...createRuntimeLifecycle({
        awaitGatewayRouteReadiness: async (value) => events.push(`ready:${value.origin}`),
        cleanup: async (value) => events.push(`cleanup:${value.project}`),
        collectDiagnostics: async () => events.push("diagnostics"),
      }),
      runJourney: async (value) => events.push(`journey:${value.runId}`),
    });

    expect(result).toEqual(descriptor);
    expect(events).toEqual([
      "ready:http://127.0.0.1:43123",
      "journey:run-contract-01",
      "diagnostics",
      "cleanup:iam-e2e-run-contract-01",
    ]);
  });

  test("bounds route readiness and still cleans the exact project after timeout", async () => {
    const events: string[] = [];

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        awaitGatewayRouteReadiness: async () => new Promise(() => undefined),
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async (value) => events.push(`cleanup:${value.project}`),
      }),
      { abortSettleTimeoutMs: 10, timeoutMs: 5 },
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toMatchObject({ message: expect.stringContaining("timed out") });
    expect(events).toEqual(["diagnostics", "cleanup:iam-e2e-run-contract-01"]);
  });

  test("preserves a Gateway route readiness failure after diagnostics and cleanup", async () => {
    const events: string[] = [];
    const readinessFailure = new Error("Gateway routes unavailable");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        startHealthyInfrastructure: async () => events.push("infra"),
        runMigrations: async () => events.push("migrate"),
        startRepoRuntimes: async () => events.push("runtimes"),
        renderGatewayRoutes: async () => events.push("routes"),
        awaitGatewayRouteReadiness: async () => {
          events.push("ready");
          throw readinessFailure;
        },
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => events.push("cleanup"),
      }),
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(readinessFailure);
    expect(events).toEqual(["infra", "migrate", "runtimes", "routes", "ready", "diagnostics", "cleanup"]);
  });

  test("keeps Gateway routes closed when a User Profile gate fails", async () => {
    const events: string[] = [];
    const gateFailure = new Error("User Profile PostgreSQL gate failed");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        seedE2EScenario: async () => events.push("seed"),
        verifyUserProfileReadiness: async () => {
          events.push("profile-gates");
          throw gateFailure;
        },
        renderGatewayRoutes: async () => events.push("routes"),
        awaitGatewayRouteReadiness: async () => events.push("ready"),
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => events.push("cleanup"),
      }),
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(gateFailure);
    expect(events).toEqual(["seed", "profile-gates", "diagnostics", "cleanup"]);
  });

  test("turns a capturable signal into a rejected run and cleans the exact project", async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const signalFailure = new Error("received SIGTERM");
    let markReadinessStarted: (() => void) | undefined;
    const readinessStarted = new Promise<void>((resolve) => {
      markReadinessStarted = resolve;
    });

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        awaitGatewayRouteReadiness: async () => {
          markReadinessStarted?.();
          return new Promise(() => undefined);
        },
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async (value) => events.push(`cleanup:${value.project}`),
      }),
      { abortSettleTimeoutMs: 10, signal: controller.signal },
    );

    await readinessStarted;
    controller.abort(signalFailure);

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(signalFailure);
    expect(events).toEqual(["diagnostics", "cleanup:iam-e2e-run-contract-01"]);
  });

  test("finishes cleanup but preserves a signal received while cleanup is running", async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const signalFailure = new Error("received second SIGINT");
    let releaseCleanup: (() => void) | undefined;
    let markCleanupStarted: (() => void) | undefined;
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanupReleased = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => {
          events.push("cleanup:start");
          markCleanupStarted?.();
          await cleanupReleased;
          events.push("cleanup:finish");
        },
      }),
      { signal: controller.signal },
    );

    await cleanupStarted;
    controller.abort(signalFailure);
    releaseCleanup?.();

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(signalFailure);
    expect(events).toEqual(["diagnostics", "cleanup:start", "cleanup:finish"]);
  });

  test("collects diagnostics before exact-project cleanup when setup fails", async () => {
    const events: string[] = [];
    const startupFailure = new Error("runtime startup failed");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        startHealthyInfrastructure: async () => events.push("infra"),
        runMigrations: async () => events.push("migrate"),
        startRepoRuntimes: async () => {
          events.push("runtimes");
          throw startupFailure;
        },
        renderGatewayRoutes: async () => events.push("routes"),
        awaitGatewayRouteReadiness: async () => events.push("ready"),
        collectDiagnostics: async (value) => events.push(`diagnostics:${value.project}`),
        cleanup: async (value) => events.push(`cleanup:${value.project}`),
      }),
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(startupFailure);
    expect(events).toEqual([
      "infra",
      "migrate",
      "runtimes",
      "diagnostics:iam-e2e-run-contract-01",
      "cleanup:iam-e2e-run-contract-01",
    ]);
  });

  test("bounds the diagnostic phase so a hung collector cannot prevent cleanup", async () => {
    const events: string[] = [];
    const warnings: string[] = [];
    const startupFailure = new Error("runtime startup failed");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        startHealthyInfrastructure: async () => {
          throw startupFailure;
        },
        collectDiagnostics: async () => new Promise(() => undefined),
        cleanup: async () => events.push("cleanup"),
      }),
      { abortSettleTimeoutMs: 10, diagnosticsTimeoutMs: 5, warn: (message) => warnings.push(message) },
    );

    let failure: unknown;
    try {
      await run;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(startupFailure);
    expect(warnings).toHaveLength(1);
    expect(events).toEqual(["cleanup"]);
  });

  test("surfaces cleanup failure at the top level without losing the triggering setup failure", async () => {
    const startupFailure = new Error("runtime startup failed");
    const cleanupFailure = new Error("exact-project cleanup failed");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        startHealthyInfrastructure: async () => {
          throw startupFailure;
        },
        cleanup: async () => {
          throw cleanupFailure;
        },
      }),
    );

    let failure: unknown;
    try {
      await run;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error("expected AggregateError");
    expect(failure.errors).toEqual([startupFailure, cleanupFailure]);
  });

  test("collects diagnostics before cleanup when cleanup is the only failure", async () => {
    const events: string[] = [];
    const cleanupFailure = new Error("exact-project cleanup failed");

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        collectDiagnostics: async () => events.push("diagnostics"),
        cleanup: async () => {
          events.push("cleanup");
          throw cleanupFailure;
        },
      }),
    );

    const rejection = await run.then(
      () => undefined,
      (error) => error,
    );
    expect(rejection).toBe(cleanupFailure);
    expect(events).toEqual(["diagnostics", "cleanup"]);
  });

  test("bounds a hung cleanup with an independent teardown signal", async () => {
    const runtimeController = new AbortController();
    const runtimeFailure = new Error("runtime interrupted");
    let teardownSignal: AbortSignal | undefined;
    let markReadinessStarted: (() => void) | undefined;
    const readinessStarted = new Promise<void>((resolve) => {
      markReadinessStarted = resolve;
    });

    const run = runExactProjectRuntimeLifecycle(
      createRuntimeLifecycle({
        awaitGatewayRouteReadiness: async () => {
          markReadinessStarted?.();
          return new Promise(() => undefined);
        },
        cleanup: async (_value, signal) => {
          teardownSignal = signal;
          return new Promise(() => undefined);
        },
      }),
      {
        abortSettleTimeoutMs: 10,
        cleanupTimeoutMs: 5,
        signal: runtimeController.signal,
      },
    );

    await readinessStarted;
    runtimeController.abort(runtimeFailure);
    let failure: unknown;
    try {
      await run;
    } catch (error) {
      failure = error;
    }
    expect(teardownSignal).not.toBe(runtimeController.signal);
    expect(teardownSignal?.aborted).toBe(true);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error("expected AggregateError");
    expect(failure.errors).toEqual([
      runtimeFailure,
      expect.objectContaining({
        message: "E2E exact-project cleanup timed out after 5ms",
      }),
    ]);
  });
});
