import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistRunDescriptor } from "../../src/descriptor.ts";
import { collectRunDiagnostics } from "../../src/diagnostics.ts";
import { createDockerInfraOperations } from "../../src/docker-infra.ts";
import type { ExactProjectRuntimeLifecycle, RunDescriptor } from "../../src/lifecycle.ts";
import { runExactProjectJourneyLifecycle, runExactProjectRuntimeLifecycle } from "../../src/lifecycle.ts";

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
});
