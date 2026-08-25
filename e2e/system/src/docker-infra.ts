import type { RunDescriptor } from "./lifecycle.ts";
import { Buffer } from "node:buffer";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { createBoundedLineCapture } from "./command-capture.ts";
import { collectRunDiagnostics } from "./diagnostics.ts";
import { assertCanonicalOriginComposeConfig } from "./origin-contract.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

const diagnosticLogServices = [
  "postgres",
  "redis",
  "apisix-etcd",
  "apisix",
  "api",
  "admin-api",
  "oidc-provider",
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

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions,
) => Promise<unknown>;

export type CapturedCommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions,
) => Promise<{ stdout: string; stderr: string }>;

export interface CreateDockerInfraOperationsOptions {
  composeFile: string;
  repositoryRoot: string;
  requiredPaths: string[];
  runCommand: CommandRunner;
  captureCommand: CapturedCommandRunner;
  probeGateway: (origin: string, signal?: AbortSignal) => Promise<unknown>;
  probeOidcDiscovery: (
    origin: string,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  probeSsoConfiguration: (
    origin: string,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  probeRoute: (
    origin: string,
    path: string,
    expectedStatuses: number[],
    signal?: AbortSignal,
  ) => Promise<unknown>;
  signal?: AbortSignal;
  writeMigrationReceipt?: (
    descriptor: RunDescriptor,
    receipt: MigrationReceipt,
  ) => Promise<unknown>;
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

type MigrationReceipt
  = | AttemptedMigrationReceipt
    | NotAttemptedMigrationReceipt;

export function composeArguments(
  composeFile: string,
  project: string,
  args: string[],
) {
  return [
    "compose",
    "--file",
    composeFile,
    "--project-name",
    project,
    ...args,
  ];
}

export function descriptorEnvironment(descriptor: RunDescriptor) {
  const scenario = createE2EScenarioIdentity(descriptor.runId);
  return {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: "1",
    IAM_E2E_GATEWAY_PORT: String(descriptor.gatewayPort),
    IAM_E2E_GATEWAY_AUTHORITY: new URL(descriptor.origin).host,
    IAM_E2E_ADMIN_CLIENT_CODE: scenario.adminClientCode,
    IAM_E2E_ADMIN_ROLE_CODE: scenario.adminRoleCode,
    IAM_E2E_ORIGIN: descriptor.origin,
    IAM_E2E_PROJECT: descriptor.project,
    IAM_E2E_RUN_ID: descriptor.runId,
  };
}

export function createDockerInfraOperations(
  options: CreateDockerInfraOperationsOptions,
) {
  const writeMigrationReceipt = options.writeMigrationReceipt
    ?? persistMigrationReceipt;
  const commandOptions: CommandOptions = {
    cwd: options.repositoryRoot,
    signal: options.signal,
  };
  const cleanupProject = async (
    project: string,
    env: NodeJS.ProcessEnv = recoveryEnvironment(project),
    signal?: AbortSignal,
  ) => {
    await options.runCommand(
      "docker",
      composeArguments(options.composeFile, project, [
        "down",
        "-v",
        "--remove-orphans",
        "--rmi",
        "local",
      ]),
      { cwd: options.repositoryRoot, env, signal },
    );
  };

  return {
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
      await Promise.all(options.requiredPaths.map(path => access(path)));
      await options.runCommand(
        "docker",
        ["version", "--format", "{{.Server.Version}}"],
        preflightCommandOptions,
      );
      await options.runCommand(
        "docker",
        ["compose", "version", "--short"],
        preflightCommandOptions,
      );
      await options.runCommand(
        "docker",
        composeArguments(options.composeFile, "iam-e2e-preflight", [
          "config",
          "--quiet",
        ]),
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

    async startHealthyInfrastructure(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
      await options.runCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, [
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

    async prepareDiagnostics(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
      await options.runCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, [
          "build",
          "gateway-sync",
        ]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
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
          composeArguments(options.composeFile, descriptor.project, [
            "run",
            "--rm",
            "--no-deps",
            "--build",
            "migrate",
          ]),
          {
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal: signal ?? options.signal,
          },
        );
      }
      catch (error) {
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
        }
        catch (receiptFailure) {
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
        composeArguments(options.composeFile, descriptor.project, [
          "up",
          "--detach",
          "--wait",
          "--wait-timeout",
          "300",
          "--build",
          "api",
          "admin-api",
          "oidc-provider",
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

    async verifyCanonicalOriginConfiguration(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
      const scenario = createE2EScenarioIdentity(descriptor.runId);
      const result = await options.captureCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, [
          "config",
          "--format",
          "json",
        ]),
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
      }
      catch {
        throw new Error("rendered Compose configuration is not valid JSON");
      }
      assertCanonicalOriginComposeConfig(renderedConfig, {
        adminClientCode: scenario.adminClientCode,
        canonicalOrigin: descriptor.origin,
        runId: descriptor.runId,
      });
    },

    async seedE2EScenario(descriptor: RunDescriptor, signal?: AbortSignal) {
      await options.runCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, [
          "run",
          "--rm",
          "--no-deps",
          "--build",
          "seed",
        ]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
    },

    async verifyUserProfileReadiness(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
      for (const operation of ["verify-postgres", "verify-redis"] as const) {
        const script = `user-profile:${operation}`;
        const result = await options.captureCommand(
          "docker",
          composeArguments(options.composeFile, descriptor.project, [
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
        composeArguments(options.composeFile, descriptor.project, [
          "run",
          "--rm",
          "--no-deps",
          "--build",
          "gateway-sync",
        ]),
        {
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: signal ?? options.signal,
        },
      );
    },

    async awaitGatewayRouteReadiness(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
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
        await options.probeRoute(
          descriptor.origin,
          probe.path,
          probe.statuses,
          signal ?? options.signal,
        );
      }
      await options.probeOidcDiscovery(
        descriptor.origin,
        signal ?? options.signal,
      );
      await options.probeSsoConfiguration(
        descriptor.origin,
        signal ?? options.signal,
      );
    },

    async collectDiagnostics(
      descriptor: RunDescriptor,
      signal?: AbortSignal,
    ) {
      const capture = (
        args: string[],
        captureSignal?: AbortSignal,
        captureOptions?: CommandOptions["capture"],
      ) => options.captureCommand(
        "docker",
        composeArguments(options.composeFile, descriptor.project, args),
        {
          capture: captureOptions,
          cwd: options.repositoryRoot,
          env: descriptorEnvironment(descriptor),
          signal: captureSignal,
        },
      );
      await collectRunDiagnostics({
        descriptor,
        signal,
        readComposePs: async sourceSignal => (await capture([
          "ps",
          "--all",
          "--format",
          "json",
        ], sourceSignal)).stdout,
        readRecentLogs: async (sourceSignal) => {
          const logs = await Promise.all(
            diagnosticLogServices.map(async (service) => {
              let content: string;
              let unavailable = false;
              try {
                const result = await capture(
                  [
                    "logs",
                    "--no-color",
                    "--no-log-prefix",
                    "--tail",
                    "200",
                    service,
                  ],
                  sourceSignal,
                  { maxBytes: maxDiagnosticLogBytesPerService, mode: "line-tail" },
                );
                content = boundCompleteLineTail(
                  `${result.stdout}${result.stderr}`,
                  maxDiagnosticLogBytesPerService,
                );
              }
              catch (error) {
                unavailable = true;
                content = `diagnostic source unavailable: ${error instanceof Error ? error.name : "UnknownError"}`;
              }
              return {
                content: [
                  `===== ${service} =====`,
                  content,
                ].join("\n"),
                service,
                unavailable,
              };
            }),
          );
          return {
            content: `${logs.map(log => log.content).join("\n")}\n`,
            unavailableSources: logs
              .filter(log => log.unavailable)
              .map(log => log.service),
          };
        },
        readGatewayState: async (sourceSignal) => {
          const result = await capture([
            "run",
            "--rm",
            "--no-deps",
            "gateway-sync",
            "bun",
            "-e",
            "const r=await fetch('http://apisix:9180/apisix/admin/routes',{headers:{'X-API-KEY':'dev-local-admin-key-change-me'},signal:AbortSignal.timeout(5000)});console.log(await r.text());if(!r.ok)process.exit(1)",
          ], sourceSignal);
          return `${result.stdout}${result.stderr}`;
        },
      });
    },

    async cleanup(descriptor: RunDescriptor, signal?: AbortSignal) {
      await cleanupProject(
        descriptor.project,
        descriptorEnvironment(descriptor),
        signal,
      );
    },

    cleanupProject,
  };
}

function assertUserProfileGateOutput(
  operation: "verify-postgres" | "verify-redis",
  output: string,
) {
  const expectedGate = operation === "verify-postgres"
    ? "postgres"
    : "redis-access";
  const passed = output.split(/\r?\n/u).some((line) => {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      return record.version === 3
        && record.gate === expectedGate
        && record.status === "passed";
    }
    catch {
      return false;
    }
  });
  if (!passed) {
    throw new Error(
      `User Profile ${expectedGate} gate did not report a passing v3 inventory`,
    );
  }
}

function boundCompleteLineTail(value: string, maxBytes: number) {
  const capture = createBoundedLineCapture(maxBytes);
  capture.append(Buffer.from(value, "utf8"));
  return capture.toString();
}

async function persistMigrationReceipt(
  descriptor: RunDescriptor,
  receipt: MigrationReceipt,
) {
  const receiptPath = join(
    descriptor.artifactDirectory,
    "migration-receipt.json",
  );
  await writeAtomicJsonFile(receiptPath, receipt);
}

function recoveryEnvironment(project: string) {
  const runId = project.slice("iam-e2e-".length);
  return {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: "1",
    IAM_E2E_GATEWAY_PORT: "49152",
    IAM_E2E_ORIGIN: "http://127.0.0.1:49152",
    IAM_E2E_PROJECT: project,
    IAM_E2E_RUN_ID: runId,
  };
}
