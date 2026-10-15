import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDockerInfraOperations } from "./docker-infra.ts";
import type { RunDescriptor } from "./lifecycle.ts";

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
  test("rejects an unregistered run before starting Docker resources", async () => {
    const commands: string[][] = [];
    const operations = createDockerInfraOperations({
      repositoryRoot: "D:/repo",
      composeFile: "D:/repo/e2e/system/compose.yaml",
      requiredPaths: [],
      runCommand: async (_command, args) => {
        commands.push(args);
      },
      captureCommand: async () => ({ stdout: "", stderr: "" }),
      probeGateway: async () => undefined,
      probeOidcDiscovery: async () => undefined,
      probeSsoConfiguration: async () => undefined,
      probeRoute: async () => undefined,
    });
    const failure = await operations.startHealthyInfrastructure(descriptor).then(
      () => undefined,
      (error) => error,
    );
    expect(failure).toMatchObject({ message: expect.stringContaining("no registered managed resource record") });
    expect(commands).toEqual([]);
  });
  test("uses the registered snapshot and exact project for startup, migration, and cleanup", async () => {
    const commands: string[][] = [];
    const operations = await createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
      },
    });

    await operations.startHealthyInfrastructure(descriptor);
    await operations.runMigrations(descriptor);
    await operations.cleanup(descriptor);

    const composeCommands = commands.filter((command) => command[1] === "compose");
    expect(composeCommands.every((command) => command.includes(descriptor.project))).toBe(true);
    expect(commands.at(-1)?.slice(-5)).toEqual(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
    const snapshot = commands[0]?.[commands[0].indexOf("--file") + 1];
    expect(snapshot).toEndWith("compose.json");
    expect(commands.at(-1)).toContain(snapshot);
    expect(commands.at(-1)).toContain("--env-file");
    expect(commands.at(-1)).toContain("--project-directory");
    expect(commands.flat()).not.toContain("prune");
    expect(commands.some((command) => command[1] === "container")).toBe(false);
    expect(commands.some((command) => command[1] === "network")).toBe(false);
    expect(commands.some((command) => command[1] === "volume")).toBe(false);
    expect(commands.some((command) => command[1] === "image")).toBe(false);
  });

  test("starts all repo runtimes and probes every public route", async () => {
    const commands: string[][] = [];
    const probes: string[] = [];
    const operations = await createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
      },
      probeOidcDiscovery: async (origin) => probes.push(`oidc:${origin}`),
      probeSsoConfiguration: async (origin) => probes.push(`sso:${origin}`),
      probeRoute: async (_origin, path, statuses) => {
        probes.push(`${path}:${statuses.join(",")}`);
      },
    });

    await operations.startRepoRuntimes(descriptor);
    await operations.renderGatewayRoutes(descriptor);
    await operations.awaitGatewayRouteReadiness(descriptor);

    const runtime = commands.find((command) => command.includes("api"));
    for (const service of ["api", "admin-api", "worker", "admin", "sso"]) {
      expect(runtime).toContain(service);
    }
    expect(new Set(probes)).toEqual(
      new Set([
        "/portal/login:200",
        "/iam-admin/:200",
        "/sso/.well-known/authentication-configuration:200",
        "/api/iam/admin/users/search:403",
        `oidc:${descriptor.origin}`,
        `sso:${descriptor.origin}`,
      ]),
    );
  });

  test("exports the retained exact seed receipt before removing its container", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-seed-export-"));
    const commands: string[][] = [];
    const operations = await createOperations({
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
        if (args[0] === "cp") await writeFile(args[2]!, JSON.stringify(appliedSeedReceipt()));
      },
    });
    try {
      await operations.seedE2EScenario({ ...descriptor, artifactDirectory });
      expect(commands[0]).toContain(`${descriptor.project}-seed`);
      expect(commands[0]).not.toContain("--rm");
      expect(commands.slice(1)).toEqual([
        [
          "docker",
          "cp",
          `${descriptor.project}-seed:/artifacts/${descriptor.runId}/seed-receipt.json`,
          join(artifactDirectory, "seed-receipt.json"),
        ],
        ["docker", "rm", "--force", `${descriptor.project}-seed`],
      ]);
      const receipt = JSON.parse(await readFile(join(artifactDirectory, "seed-receipt.json"), "utf8"));
      expect(receipt.status).toBe("applied");
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test.each([
    "export-failure",
    "missing",
    "invalid-json",
    "not-applied",
    "invalid-completion",
    "wrong-run",
    "missing-reference",
  ])("treats %s as a required seed input failure and still removes the container", async (fault) => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-seed-fault-"));
    const commands: string[][] = [];
    const operations = await createOperations({
      runCommand: async (_command, args) => {
        commands.push(args);
        if (args[0] !== "cp") return;
        if (fault === "export-failure") throw new Error("controlled docker cp failure");
        if (fault === "missing") return;
        const receipt = appliedSeedReceipt();
        if (fault === "not-applied") receipt.status = "attempted";
        if (fault === "invalid-completion") receipt.completedAt = "invalid";
        if (fault === "wrong-run") receipt.scenario.runId = "another-run";
        if (fault === "missing-reference") receipt.scenario.hiddenResponsibilityAssignmentId = 0;
        await writeFile(args[2]!, fault === "invalid-json" ? "{" : JSON.stringify(receipt));
      },
    });
    try {
      let failure: unknown;
      try {
        await operations.seedE2EScenario({ ...descriptor, artifactDirectory });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(commands.at(-1)).toEqual(["rm", "--force", `${descriptor.project}-seed`]);
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test("exports an existing failed seed receipt after stopping the exact container despite the aborted runtime signal", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-seed-failure-"));
    const controller = new AbortController();
    const seedFailure = new Error("controlled seed failure");
    const commands: string[][] = [];
    const operations = await createOperations({
      runCommand: async (_command, args, options) => {
        commands.push(args);
        if (args.includes("compose")) {
          controller.abort(seedFailure);
          throw seedFailure;
        }
        expect(options.signal?.aborted).toBe(false);
        if (args[0] === "cp")
          await writeFile(args[2]!, JSON.stringify({ version: 1, stage: "seed", status: "failed" }));
      },
    });
    try {
      let failure: unknown;
      try {
        await operations.seedE2EScenario({ ...descriptor, artifactDirectory }, controller.signal);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBe(seedFailure);
      expect(commands.slice(1).map((args) => args[0])).toEqual(["stop", "cp", "rm"]);
      const receipt = JSON.parse(await readFile(join(artifactDirectory, "seed-receipt.json"), "utf8"));
      expect(receipt.status).toBe("failed");
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test("registers the exact seed and recovery configuration before creating resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "iam-e2e-managed-record-"));
    const operations = createDockerInfraOperations({
      repositoryRoot: root,
      composeFile: join(root, "e2e/system/compose.yaml"),
      requiredPaths: [],
      runCommand: async (_command, args) => {
        if (!args.includes("build")) throw new Error("registration must not create resources");
      },
      captureCommand: async () => ({ stdout: JSON.stringify(renderedComposeContract()), stderr: "" }),
      probeGateway: async () => undefined,
      probeOidcDiscovery: async () => undefined,
      probeSsoConfiguration: async () => undefined,
      probeRoute: async () => undefined,
    });
    try {
      const runDescriptor = {
        ...descriptor,
        artifactDirectory: join(root, "e2e/system/test-results", descriptor.runId),
      };
      await operations.registerManagedRun(runDescriptor);
      const record = JSON.parse(
        await readFile(join(root, "test-results/integration", descriptor.runId, "run.json"), "utf8"),
      );
      expect(record.project).toBe(descriptor.project);
      expect(record.e2e.seedContainer).toBe(`${descriptor.project}-seed`);
      expect(record.e2e.artifactDirectory).toBe(`e2e/system/test-results/${descriptor.runId}`);
      expect(record.composeFile).toBe(`test-results/integration/${descriptor.runId}/compose.json`);
      const environment = JSON.parse(await readFile(join(root, record.composeEnvironmentFile), "utf8"));
      expect(environment.IAM_E2E_ORIGIN).toBe(descriptor.origin);
      expect(environment.PATH).toBeUndefined();
      await operations.prepareDiagnostics(runDescriptor);
      const activeRecord = JSON.parse(
        await readFile(join(root, "test-results/integration", descriptor.runId, "run.json"), "utf8"),
      );
      expect(activeRecord.status).toBe("initializing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runs both production User Profile v3 gates before route publication", async () => {
    const captures: string[][] = [];
    const operations = await createOperations({
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

    expect(captures.map((command) => command.slice(-6))).toEqual([
      ["worker", "bun", "run", "user-profile:verify-postgres", "--batch-size", "100"],
      ["worker", "bun", "run", "user-profile:verify-redis", "--batch-size", "100"],
    ]);
    expect(captures.flat().join(" ")).not.toMatch(/password|token|secret/iu);
  });

  test("rejects a gate command that does not report a passing v3 inventory", async () => {
    const operations = await createOperations({
      captureCommand: async () => ({
        stdout: JSON.stringify({
          version: 2,
          gate: "postgres",
          status: "passed",
        }),
        stderr: "",
      }),
    });

    const failure = await operations.verifyUserProfileReadiness(descriptor).then(
      () => undefined,
      (error) => error,
    );
    expect(failure).toMatchObject({ message: "User Profile postgres gate did not report a passing v3 inventory" });
  });

  test("renders run-scoped client, role, and Gateway authority from the descriptor", async () => {
    const environments: NodeJS.ProcessEnv[] = [];
    const operations = await createOperations({
      runCommand: async (_command, _args, options) => {
        environments.push(options.env ?? {});
      },
    });

    await operations.startRepoRuntimes(descriptor);
    await operations.renderGatewayRoutes(descriptor);

    expect(environments).toHaveLength(2);
    for (const environment of environments) {
      expect(environment).toEqual(
        expect.objectContaining({
          IAM_E2E_ADMIN_CLIENT_CODE: "iam-admin",
          IAM_E2E_ADMIN_ROLE_CODE: "iam:admin",
          IAM_E2E_GATEWAY_AUTHORITY: "127.0.0.1:43210",
        }),
      );
    }
  });

  test("verifies the rendered Compose canonical origin before seeding", async () => {
    const captures: string[][] = [];
    const operations = await createOperations({
      captureCommand: async (command, args) => {
        captures.push([command, ...args]);
        return {
          stdout: JSON.stringify(renderedComposeContract()),
          stderr: "",
        };
      },
    });

    await operations.verifyCanonicalOriginConfiguration(descriptor);

    expect(captures).toHaveLength(1);
    expect(captures[0]).toContain(descriptor.project);
    expect(captures[0]?.slice(-3)).toEqual(["config", "--format", "json"]);
    expect(captures[0]?.[captures[0].indexOf("--file") + 1]).toEndWith("compose.json");
  });

  test("records attempted and failed migration receipts", async () => {
    const receipts: unknown[] = [];
    const migrationFailure = new Error("synthetic migration failure");
    const operations = await createOperations({
      runCommand: async () => {
        throw migrationFailure;
      },
      writeMigrationReceipt: async (_descriptor, receipt) => {
        receipts.push(receipt);
      },
    });

    const failure = await operations.runMigrations(descriptor).then(
      () => undefined,
      (error) => error,
    );
    expect(failure).toBe(migrationFailure);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(expect.objectContaining({ status: "attempted" }));
    expect(receipts[1]).toEqual(
      expect.objectContaining({
        failureCategory: "Error",
        status: "failed",
      }),
    );
  });

  test("keeps bounded raw service logs and reports unavailable services", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-raw-logs-"));
    try {
      const operations = await createOperations({
        captureCommand: async (_command, args) => {
          if (!args.includes("logs")) return { stdout: "{}", stderr: "" };
          const service = args.at(-1);
          if (service === "api") throw new Error("synthetic api logs unavailable");
          return {
            stdout:
              service === "worker" ? "Authorization: Bearer SYNTHETIC-TOKEN\nlatest-worker\n" : `latest-${service}\n`,
            stderr: "",
          };
        },
      });

      let failure: unknown;
      try {
        await operations.collectDiagnostics({
          ...descriptor,
          artifactDirectory,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ message: "required diagnostic source failed" });
      const logs = await readFile(join(artifactDirectory, "compose-logs.txt"), "utf8");
      expect(logs).toContain("diagnostic source unavailable: Error");
      expect(logs).toContain("SYNTHETIC-TOKEN");
      expect(logs).toContain("latest-worker");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  test("preserves a managed cleanup failure and recovers the same registered project", async () => {
    const cleanupFailure = Object.assign(new Error("synthetic compose down failure"), {
      stdout: "failed cleanup stdout",
      stderr: "failed cleanup stderr",
    });
    const commands: string[][] = [];
    let failCleanup = true;
    const operations = await createOperations({
      captureCommand: async (_command, args) => {
        commands.push(args);
        if (args.includes("down") && failCleanup) throw cleanupFailure;
        return { stdout: "cleanup stdout", stderr: "cleanup stderr" };
      },
    });

    const failure = await operations.cleanup(descriptor).then(
      () => undefined,
      (error) => error,
    );
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toContain(cleanupFailure);
    const recordPath = join(operationRoots.at(-1)!, "test-results/integration", descriptor.runId, "run.json");
    expect(JSON.parse(await readFile(recordPath, "utf8")).status).toBe("cleanup-failed");
    expect(
      await readFile(join(operationRoots.at(-1)!, "test-results/integration", descriptor.runId, "cleanup.log"), "utf8"),
    ).toBe("failed cleanup stdoutfailed cleanup stderr");
    failCleanup = false;
    await operations.recoverProject(descriptor.project);
    expect(JSON.parse(await readFile(recordPath, "utf8")).status).toBe("cleaned");
    expect(commands[1]).toEqual(commands[0]);
  });

  test("keeps a registered environment and explicitly recovers it with a fresh cleanup signal", async () => {
    const controller = new AbortController();
    const commands: string[][] = [];
    const operations = await createOperations({
      keep: true,
      signal: controller.signal,
      captureCommand: async (_command, args, options) => {
        options.signal?.throwIfAborted();
        commands.push(args);
        expect(options.env?.IAM_E2E_ORIGIN).toBe(descriptor.origin);
        return { stdout: "", stderr: "" };
      },
    });
    controller.abort(new Error("runtime stopped"));
    await operations.cleanup(descriptor);
    const recordPath = join(operationRoots.at(-1)!, "test-results/integration", descriptor.runId, "run.json");
    expect(JSON.parse(await readFile(recordPath, "utf8")).status).toBe("kept");
    expect(commands).toEqual([]);
    await operations.recoverProject(descriptor.project);
    expect(JSON.parse(await readFile(recordPath, "utf8")).status).toBe("cleaned");
    expect(commands[0]).toContain(descriptor.project);
    expect(commands[0]?.slice(-5)).toEqual(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
  });

  test("joins a capture that fails four seconds after cleanup abort and preserves its error and output", async () => {
    const controller = new AbortController();
    const abortCause = new Error("controlled exact-project cleanup abort");
    const lateFailure = Object.assign(new Error("controlled late process tree cleanup failure"), {
      stdout: "late cleanup stdout",
      stderr: "late cleanup stderr",
    });
    let markStarted!: () => void;
    let markFinished!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      markFinished = resolve;
    });
    const operations = await createOperations({
      captureCommand: async (_command, _args, options) => {
        await new Promise<void>((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => {
              setTimeout(() => {
                markFinished();
                reject(lateFailure);
              }, 4_000);
            },
            { once: true },
          );
          markStarted();
        });
        return { stdout: "", stderr: "" };
      },
    });
    const cleanup = operations.cleanup(descriptor, controller.signal).then(
      () => undefined,
      (error) => error,
    );
    try {
      await started;
      controller.abort(abortCause);
      const failure = await cleanup;
      const failures: unknown[] = [];
      const inspect = (error: unknown) => {
        failures.push(error);
        if (error instanceof AggregateError) error.errors.forEach(inspect);
      };
      inspect(failure);
      expect(failures).toContain(abortCause);
      expect(failures).toContain(lateFailure);
      const artifactDirectory = join(operationRoots.at(-1)!, "test-results/integration", descriptor.runId);
      const record = JSON.parse(await readFile(join(artifactDirectory, "run.json"), "utf8"));
      const log = await readFile(join(artifactDirectory, "cleanup.log"), "utf8");
      expect(record.status).toBe("cleanup-failed");
      expect(log).toBe("late cleanup stdoutlate cleanup stderr");
    } finally {
      controller.abort(abortCause);
      await finished;
      await cleanup;
    }
  }, 8_000);
});

interface OperationOverrides {
  keep?: boolean;
  signal?: AbortSignal;
  captureCommand?: Parameters<typeof createDockerInfraOperations>[0]["captureCommand"];
  probeOidcDiscovery?: Parameters<typeof createDockerInfraOperations>[0]["probeOidcDiscovery"];
  probeRoute?: Parameters<typeof createDockerInfraOperations>[0]["probeRoute"];
  probeSsoConfiguration?: Parameters<typeof createDockerInfraOperations>[0]["probeSsoConfiguration"];
  runCommand?: Parameters<typeof createDockerInfraOperations>[0]["runCommand"];
  writeMigrationReceipt?: Parameters<typeof createDockerInfraOperations>[0]["writeMigrationReceipt"];
}

const operationRoots: string[] = [];
afterEach(async () => {
  for (const root of operationRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function createOperations(overrides: OperationOverrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "iam-e2e-managed-operations-"));
  operationRoots.push(root);
  const composeFile = join(root, "e2e/system/compose.yaml");
  const operations = createDockerInfraOperations({
    keep: overrides.keep,
    signal: overrides.signal,
    composeFile,
    repositoryRoot: root,
    requiredPaths: [],
    runCommand: overrides.runCommand ?? (async () => undefined),
    captureCommand: async (command, args, options) => {
      if (args.includes(composeFile)) return { stdout: JSON.stringify(renderedComposeContract()), stderr: "" };
      if (overrides.captureCommand) return await overrides.captureCommand(command, args, options);
      if (args.includes("down")) await overrides.runCommand?.(command, args, options);
      return { stdout: "", stderr: "" };
    },
    probeGateway: async () => undefined,
    probeOidcDiscovery: overrides.probeOidcDiscovery ?? (async () => undefined),
    probeRoute: overrides.probeRoute ?? (async () => undefined),
    probeSsoConfiguration: overrides.probeSsoConfiguration ?? (async () => undefined),
    writeMigrationReceipt: overrides.writeMigrationReceipt ?? (async () => undefined),
  });
  await operations.registerManagedRun({
    ...descriptor,
    artifactDirectory: join(root, "e2e/system/test-results", descriptor.runId),
  });
  return operations;
}

function renderedComposeContract() {
  return {
    services: {
      api: {
        environment: {
          IAM_API_SSO_INTERNAL_ORIGIN: descriptor.origin,
          IAM_API_SSO_EXTERNAL_ORIGIN: descriptor.origin,
        },
      },
      "gateway-sync": {
        environment: {
          IAM_SSO_INTERNAL_HOST: "127.0.0.1:43210",
          IAM_SSO_EXTERNAL_HOST: "127.0.0.1:43210",
        },
      },
      "admin-api": {
        environment: {
          IAM_ADMIN_API_ADMIN_CLIENT_CODES: "iam-admin",
        },
      },
      admin: {
        build: {
          args: {
            UMI_APP_ADMIN_CLIENT_CODE: "iam-admin",
          },
        },
      },
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

function appliedSeedReceipt() {
  return {
    version: 1,
    stage: "seed",
    status: "applied",
    completedAt: "2026-10-14T17:00:00.000Z",
    scenario: {
      version: 1,
      runId: descriptor.runId,
      canonicalOrigin: descriptor.origin,
      adminMixedRoleAssignmentId: 40,
      hiddenResponsibilityAssignmentId: 41,
      hrSecondScopeRoleAssignmentId: 42,
      outsideResponsibilityHolderEmploymentId: 43,
      responsibilityHolderEmploymentId: 44,
    },
  };
}
