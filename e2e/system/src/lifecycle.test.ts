import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistRunDescriptor } from "./descriptor.ts";
import { collectRunDiagnostics } from "./diagnostics.ts";
import { createDockerInfraOperations } from "./docker-infra.ts";
import type { ExactProjectRuntimeLifecycle, RunDescriptor } from "./lifecycle.ts";
import { runExactProjectJourneyLifecycle, runExactProjectRuntimeLifecycle } from "./lifecycle.ts";

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

function renderedComposeContract() {
  const authority = new URL(descriptor.origin).host;
  return {
    services: {
      api: {
        environment: { IAM_API_SSO_INTERNAL_ORIGIN: descriptor.origin, IAM_API_SSO_EXTERNAL_ORIGIN: descriptor.origin },
      },
      "gateway-sync": { environment: { IAM_SSO_INTERNAL_HOST: authority, IAM_SSO_EXTERNAL_HOST: authority } },
      "admin-api": { environment: { IAM_ADMIN_API_ADMIN_CLIENT_CODES: "iam-admin" } },
      admin: { build: { args: { UMI_APP_ADMIN_CLIENT_CODE: "iam-admin" } } },
      seed: {
        environment: {
          IAM_E2E_RUN_ID: descriptor.runId,
          IAM_E2E_ORIGIN: descriptor.origin,
          IAM_E2E_SEED_RECEIPT_PATH: `/artifacts/${descriptor.runId}/seed-receipt.json`,
        },
      },
    },
  };
}

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

  test("indexes a not-attempted receipt when diagnostic preparation fails", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "iam-e2e-prepare-failure-"));
    const artifactDirectory = join(repositoryRoot, "artifacts");
    const failureDescriptor = { ...descriptor, artifactDirectory };
    const prepareFailure = new Error("controlled diagnostic preparation failure");
    const events: string[] = [];
    try {
      const operations = createDockerInfraOperations({
        composeFile: join(repositoryRoot, "compose.yaml"),
        repositoryRoot,
        requiredPaths: [],
        runCommand: async (_command, args) => {
          if (args.includes("build") && args.at(-1) === "gateway-sync") {
            events.push("prepare-failed");
            throw prepareFailure;
          }
        },
        captureCommand: async (_command, args) => {
          if (args.includes("down")) events.push("cleanup");
          return { stdout: args.includes("config") ? JSON.stringify(renderedComposeContract()) : "{}", stderr: "" };
        },
        probeGateway: async () => undefined,
        probeOidcDiscovery: async () => undefined,
        probeSsoConfiguration: async () => undefined,
        probeRoute: async () => undefined,
      });

      const run = runExactProjectRuntimeLifecycle({
        ...operations,
        createDescriptor: async () => failureDescriptor,
        persistDescriptor: async (value) => {
          await persistRunDescriptor(value);
          await operations.registerManagedRun(value);
        },
      });

      const rejection = await run.then(
        () => undefined,
        (error) => error,
      );
      expect(rejection).toBe(prepareFailure);
      const receipt = JSON.parse(await readFile(join(artifactDirectory, "migration-receipt.json"), "utf8"));
      const index = JSON.parse(await readFile(join(artifactDirectory, "diagnostics-index.json"), "utf8"));
      expect(receipt).toEqual(
        expect.objectContaining({
          stage: "migration",
          status: "not-attempted",
        }),
      );
      expect(index.existingArtifacts).toContain("migration-receipt.json");
      expect(events).toEqual(["prepare-failed", "cleanup"]);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  test("captures Gateway state with the prepared project tool after migration failure", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "iam-e2e-early-gateway-"));
    const artifactDirectory = join(repositoryRoot, "artifacts");
    const failureDescriptor = { ...descriptor, artifactDirectory };
    const migrationFailure = new Error("controlled migration failure");
    const events: string[] = [];
    let gatewayToolPrepared = false;
    try {
      const operations = createDockerInfraOperations({
        composeFile: join(repositoryRoot, "compose.yaml"),
        repositoryRoot,
        requiredPaths: [],
        runCommand: async (_command, args) => {
          if (args.includes("build") && args.at(-1) === "gateway-sync") {
            gatewayToolPrepared = true;
            events.push("prepare-gateway-tool");
          } else if (args.includes("run") && args.at(-1) === "migrate") {
            events.push("migration-failed");
            throw migrationFailure;
          }
        },
        captureCommand: async (_command, args) => {
          if (args.includes("down")) events.push("cleanup");
          if (args.includes("config")) return { stdout: JSON.stringify(renderedComposeContract()), stderr: "" };
          if (args.includes("gateway-sync")) {
            if (!gatewayToolPrepared) throw new Error("gateway diagnostic tool unavailable");
            return { stdout: '{"routes":[]}', stderr: "" };
          }
          return { stdout: "{}", stderr: "" };
        },
        probeGateway: async () => undefined,
        probeOidcDiscovery: async () => undefined,
        probeSsoConfiguration: async () => undefined,
        probeRoute: async () => undefined,
      });

      const run = runExactProjectRuntimeLifecycle({
        ...operations,
        createDescriptor: async () => failureDescriptor,
        persistDescriptor: async (value) => {
          await persistRunDescriptor(value);
          await operations.registerManagedRun(value);
        },
      });

      const rejection = await run.then(
        () => undefined,
        (error) => error,
      );
      expect(rejection).toBe(migrationFailure);
      const gatewayState = await readFile(join(artifactDirectory, "gateway-state.json"), "utf8");
      const migrationReceipt = JSON.parse(await readFile(join(artifactDirectory, "migration-receipt.json"), "utf8"));
      const diagnosticsIndex = JSON.parse(await readFile(join(artifactDirectory, "diagnostics-index.json"), "utf8"));
      expect(gatewayState).toContain('"routes":[]');
      expect(gatewayState).not.toContain("unavailable");
      expect(migrationReceipt).toEqual(
        expect.objectContaining({
          stage: "migration",
          status: "failed",
        }),
      );
      expect(diagnosticsIndex.existingArtifacts).toContain("migration-receipt.json");
      expect(events).toEqual(["prepare-gateway-tool", "migration-failed", "cleanup"]);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
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

  test("warns after auxiliary diagnostic captures fail without failing a successful runtime", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "iam-e2e-diagnostic-failure-"));
    const artifactDirectory = join(repositoryRoot, "artifacts");
    const events: string[] = [];
    const warnings: string[] = [];
    try {
      const operations = createDockerInfraOperations({
        composeFile: join(repositoryRoot, "compose.yaml"),
        repositoryRoot,
        requiredPaths: [],
        runCommand: async () => undefined,
        captureCommand: async (_command, args) => {
          if (args.includes("down")) {
            events.push("cleanup");
            return { stdout: "", stderr: "" };
          }
          if (args.includes("config")) return { stdout: JSON.stringify(renderedComposeContract()), stderr: "" };
          throw new Error("capture failed with CLIENT-ASSERTION-LEAK");
        },
        probeGateway: async () => undefined,
        probeOidcDiscovery: async () => undefined,
        probeSsoConfiguration: async () => undefined,
        probeRoute: async () => undefined,
        writeMigrationReceipt: async () => undefined,
      });
      const run = runExactProjectRuntimeLifecycle(
        {
          ...operations,
          collectDiagnostics: async (value, signal) =>
            collectRunDiagnostics({
              descriptor: value,
              signal,
              readComposePs: async () => {
                throw new Error("capture failed with CLIENT-ASSERTION-LEAK");
              },
              readPlaywrightEvidence: async () => {
                throw new Error("Playwright failed with CLIENT-ASSERTION-LEAK");
              },
              readRecentLogs: async () => {
                throw new Error("capture failed with CLIENT-ASSERTION-LEAK");
              },
              readGatewayState: async () => {
                throw new Error("capture failed with CLIENT-ASSERTION-LEAK");
              },
            }),
          createDescriptor: async () => ({ ...descriptor, artifactDirectory }),
          persistDescriptor: async (value) => {
            await persistRunDescriptor(value);
            await operations.registerManagedRun(value);
          },
          verifyUserProfileReadiness: async () => undefined,
          verifyCanonicalOriginConfiguration: async () => undefined,
          seedE2EScenario: async () => undefined,
        },
        { warn: (message: string) => warnings.push(message) },
      );

      let failure: unknown;
      try {
        await run;
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeUndefined();
      expect(warnings.join("\n")).toContain("diagnostic");
      expect(warnings.join("\n")).not.toContain("CLIENT-ASSERTION-LEAK");
      expect(events).toEqual(["cleanup"]);
      expect(await readFile(join(artifactDirectory, "compose-ps.json"), "utf8")).toContain(
        "diagnostic source unavailable",
      );
      expect(await readFile(join(artifactDirectory, "compose-logs.txt"), "utf8")).toContain(
        "diagnostic source unavailable",
      );
      expect(await readFile(join(artifactDirectory, "gateway-state.json"), "utf8")).toContain(
        "diagnostic source unavailable",
      );
      expect(JSON.parse(await readFile(join(artifactDirectory, "playwright-evidence.json"), "utf8"))).toEqual({
        version: 1,
        status: "unavailable",
        artifacts: [],
      });
      const index = JSON.parse(await readFile(join(artifactDirectory, "diagnostics-index.json"), "utf8")) as {
        generatedArtifacts: string[];
        unavailableSources: string[];
      };
      expect(index.generatedArtifacts).toContain("playwright-evidence.json");
      expect(index.unavailableSources).toContain("playwright-evidence");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
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

  test("a required receipt export failure prevents readiness and every dependent journey", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "iam-e2e-required-input-"));
    const artifactDirectory = join(repositoryRoot, "artifacts");
    const events: string[] = [];
    const exportFailure = new Error("required receipt export failed");
    const operations = createDockerInfraOperations({
      composeFile: join(repositoryRoot, "compose.yaml"),
      repositoryRoot,
      requiredPaths: [],
      runCommand: async (_command, args) => {
        if (args[0] === "cp") throw exportFailure;
        if (args[0] === "rm") events.push("seed-removed");
      },
      captureCommand: async () => ({ stdout: JSON.stringify(renderedComposeContract()), stderr: "" }),
      probeGateway: async () => undefined,
      probeOidcDiscovery: async () => undefined,
      probeSsoConfiguration: async () => undefined,
      probeRoute: async () => undefined,
    });
    try {
      await mkdir(artifactDirectory, { recursive: true });
      await operations.registerManagedRun({ ...descriptor, artifactDirectory });
      let failure: unknown;
      try {
        await runExactProjectJourneyLifecycle({
          ...createRuntimeLifecycle({
            createDescriptor: async () => ({ ...descriptor, artifactDirectory }),
            seedE2EScenario: operations.seedE2EScenario,
            verifyUserProfileReadiness: async () => events.push("readiness"),
            collectDiagnostics: async () => events.push("diagnostics"),
            cleanup: async () => events.push("cleanup"),
          }),
          runJourney: async () => events.push("journey"),
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBe(exportFailure);
      expect(events).toEqual(["seed-removed", "diagnostics", "cleanup"]);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
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
