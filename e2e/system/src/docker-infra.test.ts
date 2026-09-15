import type { RunDescriptor } from "./lifecycle.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createDockerInfraOperations } from "./docker-infra.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "run-command-contract",
  project: "iam-e2e-run-command-contract",
  gatewayPort: 43210,
  origin: "http://127.0.0.1:43210",
  artifactDirectory: "C:/tmp/iam-e2e/run-command-contract",
  labels: {
    "com.docker.compose.project": "iam-e2e-run-command-contract",
    "com.shgas-iam.e2e.run-id": "run-command-contract",
  },
};

describe("exact-project Docker infrastructure", () => {
  test("uses one exact project for startup, migration, and simple cleanup", async () => {
    const commands: string[][] = [];
    const operations = createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
      },
    });

    await operations.startHealthyInfrastructure(descriptor);
    await operations.runMigrations(descriptor);
    await operations.cleanup(descriptor);

    const composeCommands = commands.filter(command => command[1] === "compose");
    expect(composeCommands.every(command => command.includes(
      descriptor.project,
    ))).toBe(true);
    expect(commands.at(-1)).toEqual([
      "docker",
      "compose",
      "--file",
      "D:/repo/e2e/system/compose.yaml",
      "--project-name",
      descriptor.project,
      "down",
      "-v",
      "--remove-orphans",
      "--rmi",
      "local",
    ]);
    expect(commands.flat()).not.toContain("prune");
    expect(commands.some(command => command[1] === "container")).toBe(false);
    expect(commands.some(command => command[1] === "network")).toBe(false);
    expect(commands.some(command => command[1] === "volume")).toBe(false);
    expect(commands.some(command => command[1] === "image")).toBe(false);
  });

  test("starts all repo runtimes and probes every public route", async () => {
    const commands: string[][] = [];
    const probes: string[] = [];
    const operations = createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
      },
      probeOidcDiscovery: async origin => probes.push(`oidc:${origin}`),
      probeSsoConfiguration: async origin => probes.push(`sso:${origin}`),
      probeRoute: async (_origin, path, statuses) => {
        probes.push(`${path}:${statuses.join(",")}`);
      },
    });

    await operations.startRepoRuntimes(descriptor);
    await operations.renderGatewayRoutes(descriptor);
    await operations.awaitGatewayRouteReadiness(descriptor);

    const runtime = commands.find(command => command.includes("api"));
    for (const service of [
      "api",
      "admin-api",
      "worker",
      "admin",
      "sso",
    ]) {
      expect(runtime).toContain(service);
    }
    expect(probes).toEqual([
      "/portal/login:200",
      "/iam-admin/:200",
      "/sso/.well-known/authentication-configuration:200",
      "/api/iam/admin/users/search:403",
      `oidc:${descriptor.origin}`,
      `sso:${descriptor.origin}`,
    ]);
  });

  test("runs the fixed seed as a one-shot project service without credentials in command arguments", async () => {
    const commands: string[][] = [];
    const operations = createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
      },
    });

    await operations.seedE2EScenario(descriptor);

    expect(commands).toEqual([[
      "docker",
      "compose",
      "--file",
      "D:/repo/e2e/system/compose.yaml",
      "--project-name",
      descriptor.project,
      "run",
      "--rm",
      "--no-deps",
      "--build",
      "seed",
    ]]);
    expect(commands.flat().join(" ")).not.toMatch(/password|token|secret/iu);
  });

  test("runs both production User Profile v3 gates before route publication", async () => {
    const captures: string[][] = [];
    const operations = createOperations({
      captureCommand: async (command, args) => {
        captures.push([command, ...args]);
        const operation = args.at(-3)?.replace("user-profile:", "");
        return {
          stdout: JSON.stringify({
            version: 3,
            gate: operation === "verify-postgres" ? "postgres" : "redis-access",
            status: "passed",
          }),
          stderr: "",
        };
      },
    });

    await operations.verifyUserProfileReadiness(descriptor);

    expect(captures).toHaveLength(2);
    expect(captures.map(command => command.slice(-6))).toEqual([
      [
        "worker",
        "bun",
        "run",
        "user-profile:verify-postgres",
        "--batch-size",
        "100",
      ],
      [
        "worker",
        "bun",
        "run",
        "user-profile:verify-redis",
        "--batch-size",
        "100",
      ],
    ]);
    expect(captures.flat().join(" ")).not.toMatch(/password|token|secret/iu);
  });

  test("rejects a gate command that does not report a passing v3 inventory", async () => {
    const operations = createOperations({
      captureCommand: async () => ({
        stdout: JSON.stringify({
          version: 2,
          gate: "postgres",
          status: "passed",
        }),
        stderr: "",
      }),
    });

    await expect(operations.verifyUserProfileReadiness(descriptor)).rejects.toThrow(
      "User Profile postgres gate did not report a passing v3 inventory",
    );
  });

  test("renders run-scoped client, role, and Gateway authority from the descriptor", async () => {
    const environments: NodeJS.ProcessEnv[] = [];
    const operations = createOperations({
      runCommand: async (_command, _args, options) => {
        environments.push(options.env ?? {});
      },
    });

    await operations.startRepoRuntimes(descriptor);
    await operations.renderGatewayRoutes(descriptor);

    expect(environments).toHaveLength(2);
    for (const environment of environments) {
      expect(environment).toEqual(expect.objectContaining({
        IAM_E2E_ADMIN_CLIENT_CODE: "iam-admin",
        IAM_E2E_ADMIN_ROLE_CODE: "iam:admin",
        IAM_E2E_GATEWAY_AUTHORITY: "127.0.0.1:43210",
      }));
    }
  });

  test("verifies the rendered Compose canonical origin before seeding", async () => {
    const captures: string[][] = [];
    const operations = createOperations({
      captureCommand: async (command, args) => {
        captures.push([command, ...args]);
        return {
          stdout: JSON.stringify(renderedComposeContract()),
          stderr: "",
        };
      },
    });

    await operations.verifyCanonicalOriginConfiguration(descriptor);

    expect(captures).toEqual([[
      "docker",
      "compose",
      "--file",
      "D:/repo/e2e/system/compose.yaml",
      "--project-name",
      descriptor.project,
      "config",
      "--format",
      "json",
    ]]);
  });

  test("records attempted and failed migration receipts", async () => {
    const receipts: unknown[] = [];
    const migrationFailure = new Error("synthetic migration failure");
    const operations = createOperations({
      runCommand: async () => {
        throw migrationFailure;
      },
      writeMigrationReceipt: async (_descriptor, receipt) => {
        receipts.push(receipt);
      },
    });

    await expect(operations.runMigrations(descriptor)).rejects.toBe(
      migrationFailure,
    );
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(expect.objectContaining({ status: "attempted" }));
    expect(receipts[1]).toEqual(expect.objectContaining({
      failureCategory: "Error",
      status: "failed",
    }));
  });

  test("keeps bounded raw service logs and reports unavailable services", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-raw-logs-"));
    try {
      const operations = createOperations({
        captureCommand: async (_command, args) => {
          if (!args.includes("logs"))
            return { stdout: "{}", stderr: "" };
          const service = args.at(-1);
          if (service === "api")
            throw new Error("synthetic api logs unavailable");
          return {
            stdout: service === "worker"
              ? "Authorization: Bearer SYNTHETIC-TOKEN\nlatest-worker\n"
              : `latest-${service}\n`,
            stderr: "",
          };
        },
      });

      await expect(operations.collectDiagnostics({
        ...descriptor,
        artifactDirectory,
      })).rejects.toThrow("required diagnostic source failed");
      const logs = await readFile(join(artifactDirectory, "compose-logs.txt"), "utf8");
      expect(logs).toContain("diagnostic source unavailable: Error");
      expect(logs).toContain("SYNTHETIC-TOKEN");
      expect(logs).toContain("latest-worker");
    }
    finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  test("propagates a simple exact-project cleanup failure", async () => {
    const cleanupFailure = new Error("synthetic compose down failure");
    const operations = createOperations({
      runCommand: async (_command, args) => {
        if (args.includes("down"))
          throw cleanupFailure;
      },
    });

    await expect(operations.cleanup(descriptor)).rejects.toBe(cleanupFailure);
  });
});

interface OperationOverrides {
  captureCommand?: Parameters<typeof createDockerInfraOperations>[0]["captureCommand"];
  probeOidcDiscovery?: Parameters<typeof createDockerInfraOperations>[0]["probeOidcDiscovery"];
  probeRoute?: Parameters<typeof createDockerInfraOperations>[0]["probeRoute"];
  probeSsoConfiguration?: Parameters<typeof createDockerInfraOperations>[0]["probeSsoConfiguration"];
  runCommand?: Parameters<typeof createDockerInfraOperations>[0]["runCommand"];
  writeMigrationReceipt?: Parameters<typeof createDockerInfraOperations>[0]["writeMigrationReceipt"];
}

function createOperations(overrides: OperationOverrides = {}) {
  return createDockerInfraOperations({
    composeFile: "D:/repo/e2e/system/compose.yaml",
    repositoryRoot: "D:/repo",
    requiredPaths: [],
    runCommand: overrides.runCommand ?? (async () => undefined),
    captureCommand: overrides.captureCommand
      ?? (async () => ({ stdout: "", stderr: "" })),
    probeGateway: async () => undefined,
    probeOidcDiscovery: overrides.probeOidcDiscovery
      ?? (async () => undefined),
    probeRoute: overrides.probeRoute ?? (async () => undefined),
    probeSsoConfiguration: overrides.probeSsoConfiguration
      ?? (async () => undefined),
    writeMigrationReceipt: overrides.writeMigrationReceipt
      ?? (async () => undefined),
  });
}

function renderedComposeContract() {
  return {
    services: {
      "api": { environment: {
        IAM_API_SSO_INTERNAL_ORIGIN: descriptor.origin,
        IAM_API_SSO_EXTERNAL_ORIGIN: descriptor.origin,
        IAM_API_OIDC_ISSUER: `${descriptor.origin}/oidc`,
        IAM_API_OIDC_PUBLIC_ORIGIN: descriptor.origin,
      } },
      "gateway-sync": { environment: {
        IAM_SSO_INTERNAL_HOST: "127.0.0.1:43210",
        IAM_SSO_EXTERNAL_HOST: "127.0.0.1:43210",
      } },
      "admin-api": { environment: {
        IAM_ADMIN_API_ADMIN_CLIENT_CODES: "iam-admin",
      } },
      "admin": { build: { args: {
        UMI_APP_ADMIN_CLIENT_CODE: "iam-admin",
      } } },
      "seed": { environment: {
        IAM_E2E_RUN_ID: descriptor.runId,
        IAM_E2E_ORIGIN: descriptor.origin,
        IAM_E2E_SEED_RECEIPT_PATH: `/artifacts/${descriptor.runId}/seed-receipt.json`,
      } },
    },
  };
}
