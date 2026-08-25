import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdminJourneyOperations } from "./admin-journey.ts";
import { createRunDescriptor, persistRunDescriptor } from "./descriptor.ts";
import { createDockerInfraOperations } from "./docker-infra.ts";
import { createFullSystemJourneyOperations } from "./full-system-journey.ts";
import { createHrAdminJourneyOperations } from "./hr-admin-journey.ts";
import {
  runExactProjectJourneyLifecycle,
  runExactProjectRuntimeLifecycle,
} from "./lifecycle.ts";
import { createOidcJourneyOperations } from "./oidc-journey.ts";
import { recoverExactProject } from "./recovery.ts";
import {
  allocateAvailablePort,
  captureCommand,
  probeGateway,
  probeHttpRoute,
  probeOidcDiscovery,
  probeSsoConfiguration,
  runCommand,
} from "./system-boundaries.ts";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(sourceDirectory, "..");
const repositoryRoot = resolve(workspaceRoot, "../..");
const composeFile = join(workspaceRoot, "compose.yaml");
const artifactRoot = join(workspaceRoot, "test-results");
const runtimeTimeoutMs = 12 * 60 * 1000;

type JourneyFactoryOptions = PlaywrightJourneyRuntimeOptions & {
  captureCommand: typeof captureCommand;
  composeFile: string;
};

interface JourneyOperations {
  preflight: (signal?: AbortSignal) => Promise<unknown>;
  runJourney: (
    descriptor: Awaited<ReturnType<typeof createRunDescriptor>>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

function createRunId() {
  const timestamp = new Date().toISOString().replaceAll(/\D/gu, "");
  return `${timestamp}-${randomBytes(4).toString("hex")}`;
}

function createOperations(signal?: AbortSignal) {
  return createDockerInfraOperations({
    composeFile,
    repositoryRoot,
    requiredPaths: [
      composeFile,
      join(workspaceRoot, "docker", "migrate.Dockerfile"),
      join(workspaceRoot, "docker", "seed.Dockerfile"),
      join(workspaceRoot, "docker", "gateway-sync.Dockerfile"),
      join(workspaceRoot, "docker", "start-oidc.sh"),
      join(repositoryRoot, "gateway", "config", "config.dev.yaml"),
      join(repositoryRoot, "gateway", "manifests", "dev", "iam.yaml"),
      join(repositoryRoot, "packages", "db", "drizzle.config.ts"),
      join(repositoryRoot, "packages", "db", "src", "migrations"),
      join(repositoryRoot, "pnpm-lock.yaml"),
    ],
    runCommand,
    captureCommand,
    probeGateway,
    probeOidcDiscovery,
    probeSsoConfiguration,
    probeRoute: probeHttpRoute,
    signal,
  });
}

async function runRuntimeLifecycle() {
  await withCapturableSignals(async (signal) => {
    const operations = createOperations(signal);
    const descriptor = await runExactProjectRuntimeLifecycle({
      ...operations,
      async createDescriptor() {
        return createRunDescriptor({
          artifactRoot,
          gatewayPort: await allocateAvailablePort(),
          runId: createRunId(),
        });
      },
      persistDescriptor: persistRunDescriptor,
    }, {
      signal,
      timeoutMs: runtimeTimeoutMs,
    });
    console.log(JSON.stringify({
      status: "runtime-seeded-routes-ready-and-cleaned",
      project: descriptor.project,
      origin: descriptor.origin,
      artifactDirectory: descriptor.artifactDirectory,
    }));
  });
}

async function runAdminJourneyLifecycle() {
  await runJourneyLifecycle(
    createAdminJourneyOperations,
    "admin-custom-sso-journey-passed-and-cleaned",
  );
}

async function runOidcJourneyLifecycle() {
  await runJourneyLifecycle(
    createOidcJourneyOperations,
    "oidc-pkce-journey-passed-and-cleaned",
  );
}

async function runHrAdminJourneyLifecycle() {
  await runJourneyLifecycle(
    createHrAdminJourneyOperations,
    "hr-admin-user-management-journey-passed-and-cleaned",
  );
}

async function runFullSystemJourneyLifecycle() {
  await runJourneyLifecycle(
    options => createFullSystemJourneyOperations({
      admin: createAdminJourneyOperations(options),
      hrAdmin: createHrAdminJourneyOperations(options),
      oidc: createOidcJourneyOperations(options),
    }),
    "full-system-e2e-passed-and-cleaned",
  );
}

async function runJourneyLifecycle(
  createJourney: (
    options: JourneyFactoryOptions,
  ) => JourneyOperations,
  status: string,
) {
  await withCapturableSignals(async (signal) => {
    const operations = createOperations(signal);
    const journey = createJourney({
      captureCommand,
      composeFile,
      repositoryRoot,
      runCommand,
      workspaceRoot,
    });
    const descriptor = await runExactProjectJourneyLifecycle({
      ...operations,
      ...journey,
      async preflight(preflightSignal) {
        await journey.preflight(preflightSignal);
        await operations.preflight(preflightSignal);
      },
      async createDescriptor() {
        return createRunDescriptor({
          artifactRoot,
          gatewayPort: await allocateAvailablePort(),
          runId: createRunId(),
        });
      },
      persistDescriptor: persistRunDescriptor,
    }, {
      signal,
      timeoutMs: runtimeTimeoutMs,
    });
    console.log(JSON.stringify({
      status,
      project: descriptor.project,
      origin: descriptor.origin,
      artifactDirectory: descriptor.artifactDirectory,
    }));
  });
}

async function runRecovery(args: string[]) {
  const input = parseRecoveryArgs(args);
  await withCapturableSignals(async (signal) => {
    const operations = createOperations(signal);
    const project = await recoverExactProject(
      input,
      async (target, cleanupSignal) => operations.cleanupProject(
        target,
        undefined,
        cleanupSignal,
      ),
      { signal },
    );
    console.log(JSON.stringify({ status: "exact-project-cleaned", project }));
  });
}

async function withCapturableSignals<T>(
  operation: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const onSigint = () => controller.abort(new Error("received SIGINT"));
  const onSigterm = () => controller.abort(new Error("received SIGTERM"));
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    return await operation(controller.signal);
  }
  finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}

function parseRecoveryArgs(args: string[]) {
  if (args.length !== 2 || !["--descriptor", "--project"].includes(args[0] ?? "")) {
    throw new Error(
      "cleanup requires exactly one --descriptor <path> or --project <exact-project>",
    );
  }
  const value = args[1];
  if (value === undefined || value.trim() === "")
    throw new Error("cleanup target must not be empty");
  return args[0] === "--descriptor"
    ? { descriptorPath: value }
    : { project: value };
}

try {
  const command = process.argv[2];
  if (command === "admin")
    await runAdminJourneyLifecycle();
  else if (command === "hr-admin")
    await runHrAdminJourneyLifecycle();
  else if (command === "oidc")
    await runOidcJourneyLifecycle();
  else if (command === "e2e")
    await runFullSystemJourneyLifecycle();
  else if (command === "run")
    await runRuntimeLifecycle();
  else if (command === "cleanup")
    await runRecovery(process.argv.slice(3));
  else
    throw new Error("expected command: admin | hr-admin | oidc | e2e | run | cleanup");
}
catch (error) {
  console.error(formatFailure(error));
  process.exitCode = 1;
}

function formatFailure(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map(formatFailure)].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
