import { Buffer } from "node:buffer";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  cleanupManagedResources,
  createManagedResourceRun,
  type ManagedResourceRun,
  managedCleanupCommand,
  managedComposeArguments,
  readManagedResourceRun,
  repositoryPath,
  saveManagedResourceRun,
} from "../../../scripts/test-resources/managed-resources.mjs";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { runBoundedOperation } from "./bounded-operation.ts";
import { createBoundedLineCapture } from "./command-capture.ts";
import { collectRunDiagnostics } from "./diagnostics.ts";
import type { RunDescriptor } from "./lifecycle.ts";
import { assertCanonicalOriginComposeConfig } from "./origin-contract.ts";
import { createE2EScenarioIdentity } from "./seed.ts";
import { readAppliedSeedReferences } from "./seed-receipt.ts";

const diagnosticLogServices = [
  "postgres",
  "redis",
  "apisix-etcd",
  "apisix",
  "api",
  "admin-api",
  "worker",
  "admin",
  "sso",
];
const maxDiagnosticLogBytesPerService = 5 * 1024;

export interface CommandOptions {
  capture?: {
    maxBytes: number;
    mode: "line-tail" | "tail";
  };
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type CommandRunner = (command: string, args: string[], options: CommandOptions) => Promise<unknown>;

export type CapturedCommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions,
) => Promise<{ stdout: string; stderr: string }>;

export interface CreateDockerInfraOperationsOptions {
  keep?: boolean;
  registryFile?: string;
  composeFile: string;
  repositoryRoot: string;
  requiredPaths: string[];
  runCommand: CommandRunner;
  captureCommand: CapturedCommandRunner;
  probeGateway: (origin: string, signal?: AbortSignal) => Promise<unknown>;
  probeOidcDiscovery: (origin: string, signal?: AbortSignal) => Promise<unknown>;
  probeSsoConfiguration: (origin: string, signal?: AbortSignal) => Promise<unknown>;
  probeRoute: (origin: string, path: string, expectedStatuses: number[], signal?: AbortSignal) => Promise<unknown>;
  signal?: AbortSignal;
  writeMigrationReceipt?: (descriptor: RunDescriptor, receipt: MigrationReceipt) => Promise<unknown>;
}

interface MigrationReceiptBase {
  project: string;
  stage: "migration";
  version: 1;
}

interface NotAttemptedMigrationReceipt extends MigrationReceiptBase {
  recordedAt: string;
  status: "not-attempted";
}

interface AttemptedMigrationReceipt extends MigrationReceiptBase {
  attemptedAt: string;
  completedAt?: string;
  failureCategory?: string;
  status: "applied" | "attempted" | "failed";
}

type MigrationReceipt = AttemptedMigrationReceipt | NotAttemptedMigrationReceipt;

export function composeArguments(composeFile: string, project: string, args: string[]) {
  return ["compose", "--file", composeFile, "--project-name", project, ...args];
}

export function descriptorEnvironment(descriptor: RunDescriptor) {
  const scenario = createE2EScenarioIdentity(descriptor.runId);
  return {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: "1",
    IAM_E2E_GATEWAY_PORT: String(descriptor.gatewayPort),
    IAM_E2E_GATEWAY_AUTHORITY: new URL(descriptor.origin).host,
    IAM_E2E_INTERNAL_AUTHORITY: new URL(descriptor.internalOrigin ?? descriptor.origin).host,
    IAM_E2E_INTERNAL_ORIGIN: descriptor.internalOrigin ?? descriptor.origin,
    IAM_E2E_ADMIN_CLIENT_CODE: scenario.adminClientCode,
    IAM_E2E_ADMIN_ROLE_CODE: scenario.adminRoleCode,
    IAM_E2E_ORIGIN: descriptor.origin,
    IAM_E2E_PROJECT: descriptor.project,
    IAM_E2E_RUN_ID: descriptor.runId,
  };
}

export function createDockerInfraOperations(options: CreateDockerInfraOperationsOptions) {
  const managedRuns = new Map<string, ManagedResourceRun>();
  const requireManagedRun = (descriptor: RunDescriptor) => {
    const run = managedRuns.get(descriptor.project);
    if (!run) throw new Error(`E2E project ${descriptor.project} has no registered managed resource record`);
    return run;
  };
  const projectArguments = (descriptor: RunDescriptor, args: string[]) => {
    return managedComposeArguments(requireManagedRun(descriptor), args);
  };
  const writeMigrationReceipt = options.writeMigrationReceipt ?? persistMigrationReceipt;
  const commandOptions: CommandOptions = {
    cwd: options.repositoryRoot,
    signal: options.signal,
  };
  const cleanupRun = (run: ManagedResourceRun, parentSignal?: AbortSignal) =>
    cleanupManagedResources(run, {
      timeoutMs: 120_000,
      runCommand: async ({ executable, args = [], cwd, env, timeoutMs, cleanupTimeoutMs, logFile }) => {
        let output = "";
        let commandFailure: unknown;
        try {
          const result = await runBoundedOperation(
            async (signal) => {
              try {
                return await options.captureCommand(executable, [...args], {
                  cwd,
                  env,
                  signal,
                  capture: { maxBytes: 128 * 1024, mode: "tail" },
                });
              } catch (error) {
                commandFailure = error;
                if (error instanceof Error && "stdout" in error && "stderr" in error)
                  output = `${error.stdout}${error.stderr}`.slice(-128 * 1024);
                throw error;
              }
            },
            {
              abortSettleTimeoutMs: (cleanupTimeoutMs ?? 5_000) + 1_000,
              parentSignal,
              timeoutMs: timeoutMs ?? 120_000,
              timeoutMessage: "E2E managed resource cleanup timed out",
            },
          );
          output = `${result.stdout}${result.stderr}`.slice(-128 * 1024);
          return { exitCode: 0, signal: null, output };
        } catch (error) {
          if (commandFailure !== undefined && error !== commandFailure)
            throw new AggregateError([error, commandFailure], "E2E cleanup deadline and command both failed");
          throw error;
        } finally {
          if (logFile) {
            try {
              await writeFile(logFile, output, "utf8");
            } catch (error) {
              console.warn(
                `Warning: command log could not be saved: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      },
    });

  return {
    async registerManagedRun(descriptor: RunDescriptor) {
      const artifactDirectory = `test-results/integration/${descriptor.runId}`;
      const snapshot = `${artifactDirectory}/compose.json`;
      const result = await options.captureCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, ["config", "--format", "json"]),
        {
          capture: { maxBytes: 512 * 1024, mode: "tail" },
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: options.signal,
        },
      );
      const configuration = JSON.parse(result.stdout);
      assertCanonicalOriginComposeConfig(configuration, {
        runId: descriptor.runId,
        canonicalOrigin: descriptor.origin,
        internalOrigin: descriptor.internalOrigin,
        adminClientCode: createE2EScenarioIdentity(descriptor.runId).adminClientCode,
      });
      for (const service of Object.values(configuration.services) as Array<{ build?: { context: string } }>) {
        if (service.build) service.build.context = ".";
      }
      await mkdir(join(options.repositoryRoot, artifactDirectory), { recursive: true });
      await writeFile(join(options.repositoryRoot, snapshot), `${JSON.stringify(configuration, null, 2)}\n`, {
        mode: 0o600,
      });
      const environment = Object.fromEntries(
        Object.entries(descriptorEnvironment(descriptor)).filter(
          ([key]) => key.startsWith("IAM_E2E_") || key === "COMPOSE_DISABLE_ENV_FILE",
        ),
      ) as Record<string, string>;
      const run = await createManagedResourceRun({
        root: options.repositoryRoot,
        composeFile: snapshot,
        project: descriptor.project,
        artifactDirectory,
        composeEnvironment: environment,
        removeLocalImages: true,
        keep: options.keep,
        registryFile: options.registryFile,
      });
      Object.assign(run.record, {
        e2e: {
          runId: descriptor.runId,
          seedContainer: `${descriptor.project}-seed`,
          artifactDirectory: repositoryPath(
            options.repositoryRoot,
            relative(options.repositoryRoot, descriptor.artifactDirectory),
          ),
        },
      });
      await saveManagedResourceRun(run);
      descriptor.resourceRecord = run.recordPath;
      managedRuns.set(descriptor.project, run);
    },

    async recoverProject(project: string) {
      const recordPath = `test-results/integration/${project.slice("iam-e2e-".length)}/run.json`;
      const run = await readManagedResourceRun(options.repositoryRoot, recordPath);
      if (run.record.project !== project)
        throw new Error("E2E recovery record does not name the requested exact project");
      await cleanupRun(run);
    },
    async initializeMigrationReceipt(descriptor: RunDescriptor) {
      await writeMigrationReceipt(descriptor, {
        project: descriptor.project,
        recordedAt: new Date().toISOString(),
        stage: "migration",
        status: "not-attempted",
        version: 1,
      });
    },

    async preflight(signal?: AbortSignal) {
      const preflightCommandOptions = {
        ...commandOptions,
        signal: signal ?? options.signal,
      };
      await Promise.all(options.requiredPaths.map((path) => access(path)));
      await options.runCommand("docker", ["version", "--format", "{{.Server.Version}}"], preflightCommandOptions);
      await options.runCommand("docker", ["compose", "version", "--short"], preflightCommandOptions);
      await options.runCommand(
        "docker",
        composeArguments(options.composeFile, "iam-e2e-preflight", ["config", "--quiet"]),
        {
          cwd: options.repositoryRoot,
          env: {
            ...process.env,
            COMPOSE_DISABLE_ENV_FILE: "1",
            IAM_E2E_GATEWAY_PORT: "49152",
            IAM_E2E_PROJECT: "iam-e2e-preflight",
            IAM_E2E_RUN_ID: "preflight",
          },
          signal: signal ?? options.signal,
        },
      );
    },

    async startHealthyInfrastructure(descriptor: RunDescriptor, signal?: AbortSignal) {
      await options.runCommand(
        "docker",
        projectArguments(descriptor, [
          "up",
          "--detach",
          "--wait",
          "--wait-timeout",
          "180",
          "postgres",
          "redis",
          "apisix-etcd",
          "apisix",
        ]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
      await options.probeGateway(descriptor.origin, signal ?? options.signal);
    },

    async prepareDiagnostics(descriptor: RunDescriptor, signal?: AbortSignal) {
      const run = requireManagedRun(descriptor);
      run.record.status = "initializing";
      await saveManagedResourceRun(run);
      await options.runCommand("docker", projectArguments(descriptor, ["build", "gateway-sync"]), {
        cwd: options.repositoryRoot,
        env: descriptorEnvironment(descriptor),
        signal: signal ?? options.signal,
      });
    },

    async runMigrations(descriptor: RunDescriptor, signal?: AbortSignal) {
      const attemptedAt = new Date().toISOString();
      await writeMigrationReceipt(descriptor, {
        attemptedAt,
        project: descriptor.project,
        stage: "migration",
        status: "attempted",
        version: 1,
      });
      try {
        await options.runCommand(
          "docker",
          projectArguments(descriptor, ["run", "--rm", "--no-deps", "--build", "migrate"]),
          {
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal: signal ?? options.signal,
          },
        );
      } catch (error) {
        try {
          await writeMigrationReceipt(descriptor, {
            attemptedAt,
            completedAt: new Date().toISOString(),
            failureCategory: error instanceof Error ? error.name : "UnknownError",
            project: descriptor.project,
            stage: "migration",
            status: "failed",
            version: 1,
          });
        } catch (receiptFailure) {
          throw new AggregateError(
            [error, receiptFailure],
            "migration failed and the failed receipt could not be written",
          );
        }
        throw error;
      }
      await writeMigrationReceipt(descriptor, {
        attemptedAt,
        completedAt: new Date().toISOString(),
        project: descriptor.project,
        stage: "migration",
        status: "applied",
        version: 1,
      });
    },

    async startRepoRuntimes(descriptor: RunDescriptor, signal?: AbortSignal) {
      await options.runCommand(
        "docker",
        projectArguments(descriptor, [
          "up",
          "--detach",
          "--wait",
          "--wait-timeout",
          "300",
          "--build",
          "api",
          "admin-api",
          "worker",
          "admin",
          "sso",
        ]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
    },

    async verifyCanonicalOriginConfiguration(descriptor: RunDescriptor, signal?: AbortSignal) {
      const scenario = createE2EScenarioIdentity(descriptor.runId);
      const result = await options.captureCommand(
        "docker",
        projectArguments(descriptor, ["config", "--format", "json"]),
        {
          capture: { maxBytes: 512 * 1024, mode: "tail" },
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
      let renderedConfig: unknown;
      try {
        renderedConfig = JSON.parse(result.stdout);
      } catch {
        throw new Error("rendered Compose configuration is not valid JSON");
      }
      assertCanonicalOriginComposeConfig(renderedConfig, {
        adminClientCode: scenario.adminClientCode,
        canonicalOrigin: descriptor.origin,
        internalOrigin: descriptor.internalOrigin,
        runId: descriptor.runId,
      });
    },

    async seedE2EScenario(descriptor: RunDescriptor, signal?: AbortSignal) {
      requireManagedRun(descriptor);
      const container = `${descriptor.project}-seed`;
      const failures: unknown[] = [];
      try {
        await options.runCommand(
          "docker",
          projectArguments(descriptor, ["run", "--name", container, "--no-deps", "--build", "seed"]),
          {
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal: signal ?? options.signal,
          },
        );
      } catch (error) {
        failures.push(error);
      }
      // The creating CLI has settled. Export and removal have their own budget, including after cancellation.
      try {
        await runBoundedOperation(
          async (exportSignal) => {
            const artifactOptions = { cwd: options.repositoryRoot, signal: exportSignal };
            if (failures.length > 0) {
              try {
                await options.runCommand("docker", ["stop", "--time", "5", container], artifactOptions);
              } catch (error) {
                failures.push(error);
              }
            }
            try {
              await mkdir(descriptor.artifactDirectory, { recursive: true });
              await options.runCommand(
                "docker",
                [
                  "cp",
                  `${container}:/artifacts/${descriptor.runId}/seed-receipt.json`,
                  join(descriptor.artifactDirectory, "seed-receipt.json"),
                ],
                artifactOptions,
              );
              if (failures.length === 0) await readAppliedSeedReferences(descriptor);
            } catch (error) {
              failures.push(error);
            }
            try {
              await options.runCommand("docker", ["rm", "--force", container], artifactOptions);
            } catch (error) {
              failures.push(error);
            }
          },
          { timeoutMs: 30_000, timeoutMessage: "E2E seed receipt export and removal timed out" },
        );
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "E2E seed or required receipt export failed");
    },

    async verifyUserProfileReadiness(descriptor: RunDescriptor, signal?: AbortSignal) {
      for (const operation of ["verify-postgres", "verify-redis"] as const) {
        const script = `user-profile:${operation}`;
        const result = await options.captureCommand(
          "docker",
          projectArguments(descriptor, [
            "run",
            "--rm",
            "--no-deps",
            "worker",
            "bun",
            "run",
            script,
            "--batch-size",
            "100",
          ]),
          {
            capture: { maxBytes: 64 * 1024, mode: "line-tail" },
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal: signal ?? options.signal,
          },
        );
        assertUserProfileGateOutput(operation, `${result.stdout}\n${result.stderr}`);
      }
    },

    async renderGatewayRoutes(descriptor: RunDescriptor, signal?: AbortSignal) {
      await options.runCommand(
        "docker",
        projectArguments(descriptor, ["run", "--rm", "--no-deps", "--build", "gateway-sync"]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
    },

    async awaitGatewayRouteReadiness(descriptor: RunDescriptor, signal?: AbortSignal) {
      const run = requireManagedRun(descriptor);
      const probes = [
        { path: "/portal/login", statuses: [200] },
        { path: "/iam-admin/", statuses: [200] },
        {
          path: "/sso/.well-known/authentication-configuration",
          statuses: [200],
        },
        { path: "/api/iam/admin/users/search", statuses: [403] },
      ];
      for (const probe of probes) {
        await options.probeRoute(descriptor.origin, probe.path, probe.statuses, signal ?? options.signal);
      }
      await options.probeOidcDiscovery(descriptor.origin, signal ?? options.signal);
      await options.probeSsoConfiguration(descriptor.origin, signal ?? options.signal);
      if (descriptor.internalOrigin) {
        await options.probeOidcDiscovery(descriptor.internalOrigin, signal ?? options.signal);
        await options.probeSsoConfiguration(descriptor.internalOrigin, signal ?? options.signal);
      }
      run.record.status = "running";
      await saveManagedResourceRun(run);
    },

    async collectDiagnostics(descriptor: RunDescriptor, signal?: AbortSignal) {
      const capture = (args: string[], captureSignal?: AbortSignal, captureOptions?: CommandOptions["capture"]) =>
        options.captureCommand("docker", projectArguments(descriptor, args), {
          capture: captureOptions,
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: captureSignal,
        });
      await collectRunDiagnostics({
        descriptor,
        signal,
        readComposePs: async (sourceSignal) =>
          (await capture(["ps", "--all", "--format", "json"], sourceSignal)).stdout,
        readRecentLogs: async (sourceSignal) => {
          const logs = await Promise.all(
            diagnosticLogServices.map(async (service) => {
              let content: string;
              let unavailable = false;
              try {
                const result = await capture(
                  ["logs", "--no-color", "--no-log-prefix", "--tail", "200", service],
                  sourceSignal,
                  { maxBytes: maxDiagnosticLogBytesPerService, mode: "line-tail" },
                );
                content = boundCompleteLineTail(`${result.stdout}${result.stderr}`, maxDiagnosticLogBytesPerService);
              } catch (error) {
                unavailable = true;
                content = `diagnostic source unavailable: ${error instanceof Error ? error.name : "UnknownError"}`;
              }
              return {
                content: [`===== ${service} =====`, content].join("\n"),
                service,
                unavailable,
              };
            }),
          );
          return {
            content: `${logs.map((log) => log.content).join("\n")}\n`,
            unavailableSources: logs.filter((log) => log.unavailable).map((log) => log.service),
          };
        },
        readGatewayState: async (sourceSignal) => {
          const result = await capture(
            [
              "run",
              "--rm",
              "--no-deps",
              "gateway-sync",
              "bun",
              "-e",
              "const r=await fetch('http://apisix:9180/apisix/admin/routes',{headers:{'X-API-KEY':'dev-local-admin-key-change-me'},signal:AbortSignal.timeout(5000)});console.log(await r.text());if(!r.ok)process.exit(1)",
            ],
            sourceSignal,
          );
          return `${result.stdout}${result.stderr}`;
        },
      });
    },

    async cleanup(descriptor: RunDescriptor, signal?: AbortSignal) {
      const run = requireManagedRun(descriptor);
      if (run.record.keep) {
        run.record.status = "kept";
        await saveManagedResourceRun(run);
        console.log(`[test-resources] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
      } else await cleanupRun(run, signal);
    },
  };
}

function assertUserProfileGateOutput(operation: "verify-postgres" | "verify-redis", output: string) {
  const expectedGate = operation === "verify-postgres" ? "postgres" : "redis-access";
  const passed = output.split(/\r?\n/u).some((line) => {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      return record.version === 3 && record.gate === expectedGate && record.status === "passed";
    } catch {
      return false;
    }
  });
  if (!passed) {
    throw new Error(`User Profile ${expectedGate} gate did not report a passing v3 inventory`);
  }
}

function boundCompleteLineTail(value: string, maxBytes: number) {
  const capture = createBoundedLineCapture(maxBytes);
  capture.append(Buffer.from(value, "utf8"));
  return capture.toString();
}

async function persistMigrationReceipt(descriptor: RunDescriptor, receipt: MigrationReceipt) {
  const receiptPath = join(descriptor.artifactDirectory, "migration-receipt.json");
  await writeAtomicJsonFile(receiptPath, receipt);
}
