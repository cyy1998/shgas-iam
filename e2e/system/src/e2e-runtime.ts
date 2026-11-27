import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupManagedResources,
  createManagedResourceRun,
  finishManagedResourceRun,
  type ManagedResourceRun,
  managedServiceEndpoint,
  readManagedResourceRun,
  runManagedComposeCommand,
  writeAtomicResourceRecord,
} from "../../../scripts/test-resources/managed-resources.mjs";
import { pnpmCommand, runOwnedCommand } from "../../../scripts/test-resources/owned-command.mjs";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { runWithCleanup } from "./bounded-operation.ts";
import { buildE2EImages, ensureLocalE2EImages, parseE2EBuildConcurrency } from "./e2e-build.ts";
import {
  createE2ECompose,
  e2eApplicationServices,
  e2eBuildServices,
  e2eGatewayApiPort,
  e2eInfrastructureServices,
  e2eLogServices,
  e2eResetBackendServices,
  e2eStubsHttpPort,
} from "./e2e-compose.ts";
import { type E2ERunContext, resetE2EStubs } from "./e2e-context.ts";
import { createE2EControl } from "./e2e-control.ts";
import { restoreE2EDatabaseFromTemplate, sealE2ETemplateDatabase } from "./e2e-database.ts";
import { createE2EGatewayApiKey } from "./gateway-credential.ts";
import { iamGatewayManifest, publishGateway } from "./gateway-sync.ts";
import { probeHttpRoute, probeOidcDiscovery, probeSsoConfiguration } from "./http-probes.ts";
import { apisixAdminKey, e2eDatabaseName, e2eDatabasePassword } from "./middleware-compose.ts";
import { allocateAvailablePort } from "./port-allocation.ts";
import { createE2EScenarioInternalApiKey, type E2EScenarioReferences } from "./seed.ts";
import { wecomMobileCallbackPath } from "./wecom-provider.ts";

export interface E2ERuntimeOptions {
  repositoryRoot: string;
  skipBuild?: boolean;
  keep?: boolean;
  signal?: AbortSignal;
  startupTimeoutMs?: number;
}

const adminPassword = "iam-e2e-admin-password-local-only";
const resourcePrefix = "test-results/e2e";

export async function withE2ERuntime<T>(
  options: E2ERuntimeOptions,
  use: (contextPath: string, signal: AbortSignal) => Promise<T>,
) {
  requireLinux();
  const { repositoryRoot } = options;
  const runId = randomUUID();
  const project = `iam-e2e-${runId.replaceAll("-", "")}`;
  const artifactDirectory = `${resourcePrefix}/${project}`;
  const artifacts = join(repositoryRoot, artifactDirectory);
  const composeFile = `${artifactDirectory}/compose.json`;
  const contextPath = join(artifacts, "runtime-context.json");
  const scenarioPath = join(artifacts, "scenario.json");

  const interruption = new AbortController();
  const signal = AbortSignal.any([interruption.signal, ...(options.signal ? [options.signal] : [])]);
  const interrupt = () => interruption.abort(new Error("E2E runtime received SIGINT"));
  const terminate = () => interruption.abort(new Error("E2E runtime received SIGTERM"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);

  const deadline = new AbortController();
  const timeoutMs = options.startupTimeoutMs ?? 25 * 60_000;
  const timer = setTimeout(() => deadline.abort(new Error(`E2E startup timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    const startup = AbortSignal.any([signal, deadline.signal]);
    startup.throwIfAborted();

    const ports = await allocateDistinctPorts(2);
    const [httpPort, httpsPort] = ports as [number, number];
    const origin = `http://external.iam.localhost:${httpPort}`;
    const internalOrigin = `http://internal.iam.localhost:${httpPort}`;
    const wecomMobileOrigin = `https://external.iam.localhost:${httpsPort}`;
    const stubsToken = randomBytes(32).toString("base64url");

    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    await writeAtomicResourceRecord(
      join(repositoryRoot, composeFile),
      createE2ECompose({
        project,
        origin,
        internalOrigin,
        wecomMobileOrigin,
        httpPort,
        httpsPort,
        seedRunId: runId,
        stubsToken,
        adminClientCode: "iam-admin",
      }),
    );

    const run = await createManagedResourceRun({
      root: repositoryRoot,
      composeFile,
      artifactDirectory,
      project,
      removeLocalImages: false,
      keep: Boolean(options.keep),
      composeEnvironment: { COMPOSE_DISABLE_ENV_FILE: "1", DOCKER_BUILDKIT: "1" },
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    });
    console.log(`[e2e] Project ${project}; diagnostics ${artifacts}`);

    let passed = false;
    return await runWithCleanup(
      async () => {
        if (options.skipBuild) {
          console.log(`[e2e] --skip-build enabled; verifying ${e2eBuildServices.length} local images`);
          await ensureLocalE2EImages(e2eBuildServices, { cwd: repositoryRoot, signal: startup });
        } else {
          await buildStackImages(run, artifacts, artifactDirectory, startup);
        }

        await compose(
          run,
          "start infrastructure",
          ["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", ...e2eInfrastructureServices],
          startup,
          150_000,
        );

        const endpoint = (service: string, containerPort: number) =>
          managedServiceEndpoint(run, service, containerPort, { signal: startup, timeoutMs: 10_000 });
        const [postgres, redis, apisixAdmin, stubs] = await Promise.all([
          endpoint("postgres", 5432),
          endpoint("redis", 6379),
          endpoint("apisix", 9180),
          endpoint("e2e-stubs", e2eStubsHttpPort),
        ]);
        const databaseUrl = `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@${postgres.host}:${postgres.port}/${e2eDatabaseName}`;
        const redisUrl = `redis://${redis.host}:${redis.port}/0`;
        const stubsOrigin = `http://${stubs.host}:${stubs.port}`;
        const apisixAdminUrl = `http://${apisixAdmin.host}:${apisixAdmin.port}/apisix/admin`;

        await runMigrations(repositoryRoot, artifacts, databaseUrl, startup);

        await compose(
          run,
          "start worker for seeding",
          ["up", "--detach", "--wait", "--wait-timeout", "90", "--no-build", "--no-deps", "worker"],
          startup,
          120_000,
        );
        const seedEnv: NodeJS.ProcessEnv = {
          ...process.env,
          DATABASE_URL: databaseUrl,
          IAM_E2E_REDIS_URL: redisUrl,
          IAM_E2E_RUN_ID: runId,
          IAM_E2E_ORIGIN: origin,
          IAM_E2E_INTERNAL_ORIGIN: internalOrigin,
          IAM_E2E_ADMIN_PASSWORD: adminPassword,
          IAM_E2E_SCENARIO_PATH: scenarioPath,
        };
        await runSeedCommand(repositoryRoot, artifacts, seedEnv, "template", startup);
        const references: E2EScenarioReferences = JSON.parse(await readFile(scenarioPath, "utf8"));

        await compose(run, "stop worker before sealing template", ["stop", "worker"], startup, 40_000);
        await sealE2ETemplateDatabase(databaseUrl, startup);

        await compose(
          run,
          "start applications",
          ["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", ...e2eApplicationServices],
          startup,
          150_000,
        );

        const gatewayApi = await endpoint("gateway-api", e2eGatewayApiPort);
        await publishContainerRoutes({
          seedRunId: references.runId,
          origin,
          internalOrigin,
          wecomMobileOrigin,
          gatewayOrigin: `http://${gatewayApi.host}:${gatewayApi.port}`,
          apisixAdminUrl,
          signal: startup,
        });
        await verifyRoutes({ origin, internalOrigin, wecomMobileOrigin }, startup);

        const controlToken = randomBytes(32).toString("base64url");
        let context: E2ERunContext = {
          version: 2,
          runId,
          project,
          composeFile: join(repositoryRoot, composeFile),
          projectDirectory: repositoryRoot,
          origin,
          internalOrigin,
          wecomMobileOrigin,
          stubsOrigin,
          stubsToken,
          databaseUrl,
          redisUrl,
          adminPassword,
          internalApiKey: createE2EScenarioInternalApiKey(references.runId),
          references,
          control: { origin: "", token: controlToken },
          logServices: e2eLogServices,
          resetCount: 0,
        };

        const control = createE2EControl({
          token: controlToken,
          async reset(_file, controlSignal) {
            const resetSignal = AbortSignal.any([signal, controlSignal, AbortSignal.timeout(100_000)]);
            await compose(run, "stop backends for reset", ["stop", ...e2eResetBackendServices], resetSignal, 40_000);
            resetSignal.throwIfAborted();
            await restoreE2EDatabaseFromTemplate(databaseUrl, resetSignal);
            await runSeedCommand(repositoryRoot, artifacts, seedEnv, "restore", resetSignal);
            await resetE2EStubs(stubsOrigin, stubsToken, references.runId, resetSignal);
            await compose(
              run,
              "start backends after reset",
              [
                "up",
                "--detach",
                "--no-build",
                "--no-deps",
                "--no-recreate",
                "--wait",
                "--wait-timeout",
                "60",
                ...e2eResetBackendServices,
              ],
              resetSignal,
              80_000,
            );
            await verifyRoutes({ origin, internalOrigin, wecomMobileOrigin }, resetSignal);
            resetSignal.throwIfAborted();
            const refreshed: E2ERunContext = { ...context, resetCount: context.resetCount + 1 };
            await writeAtomicJsonFile(contextPath, refreshed, 0o600);
            context = refreshed;
          },
          stopWorker: () => compose(run, "stop worker", ["stop", "worker"], AbortSignal.timeout(30_000), 30_000),
          startWorker: (controlSignal) =>
            compose(
              run,
              "start worker",
              [
                "up",
                "--detach",
                "--no-build",
                "--no-deps",
                "--no-recreate",
                "--wait",
                "--wait-timeout",
                "60",
                "worker",
              ],
              AbortSignal.any([signal, controlSignal, AbortSignal.timeout(60_000)]),
              60_000,
            ),
          onFailure(error) {
            console.error("[e2e] Runtime control failed", error);
          },
        });

        const server = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          idleTimeout: 120,
          maxRequestBodySize: 16_384,
          fetch: control.fetch,
        });
        context = { ...context, control: { origin: server.url.origin, token: controlToken } };

        return await runWithCleanup(
          async () => {
            startup.throwIfAborted();
            await writeAtomicJsonFile(contextPath, context, 0o600);
            clearTimeout(timer);
            const result = await use(contextPath, signal);
            signal.throwIfAborted();
            passed = true;
            return result;
          },
          async () => {
            const closed = control.close();
            await runWithCleanup(
              () => server.stop(true),
              () => closed,
            );
          },
        );
      },
      () => finishManagedResourceRun(run, { cleanupTimeoutMs: 120_000, diagnostics: !passed || signal.aborted }),
    );
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

export async function cleanupE2EProject(repositoryRoot: string, project: string) {
  const run = await readManagedResourceRun(repositoryRoot, `${resourcePrefix}/${project}/run.json`);
  if (run.record.project !== project || run.record.composeFile !== `${run.record.artifactDirectory}/compose.json`) {
    throw new Error(`E2E resource record does not name the requested exact project ${project}`);
  }
  await cleanupManagedResources(run, { timeoutMs: 120_000 });
}

async function buildStackImages(
  run: ManagedResourceRun,
  artifacts: string,
  artifactDirectory: string,
  signal: AbortSignal,
) {
  const concurrency = parseE2EBuildConcurrency(process.env.IAM_E2E_BUILD_CONCURRENCY);
  console.log(`[e2e] build ${e2eBuildServices.length} images (concurrency ${concurrency})`);
  const outcomes = await buildE2EImages({
    services: e2eBuildServices,
    concurrency,
    signal,
    buildOne: async (service, buildSignal) => {
      const logPath = join(artifacts, `build-${service}.log`);
      const relativeLog = `${artifactDirectory}/build-${service}.log`;
      console.log(`[e2e] build ${service} started; log ${relativeLog}`);
      const started = performance.now();
      const result = await runManagedComposeCommand(run, ["build", service], {
        signal: buildSignal,
        timeoutMs: 20 * 60_000,
        fullLogFile: logPath,
      });
      if (result.exitCode !== 0) {
        const tail = result.output.trim().split(/\r?\n/u).slice(-40).join("\n");
        throw new Error(
          `E2E could not build ${service} (exit ${result.exitCode}; log ${relativeLog})${tail ? `:\n${tail}` : ""}`,
        );
      }
      console.log(`[e2e] build ${service} passed in ${Math.round(performance.now() - started)} ms`);
      return { logPath: relativeLog };
    },
  });
  const totalBuildMs = outcomes.reduce((sum, item) => sum + item.durationMs, 0);
  console.log(`[e2e] built ${outcomes.length} images (sum ${totalBuildMs} ms across ${concurrency} slots)`);
}

async function runMigrations(repositoryRoot: string, artifacts: string, databaseUrl: string, signal: AbortSignal) {
  console.log("[e2e] migrate database");
  const result = await runOwnedCommand({
    ...pnpmCommand(process.env.npm_execpath ?? "pnpm", ["--filter", "@iam/db", "db:migrate"]),
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    signal,
    timeoutMs: 90_000,
    logFile: join(artifacts, "migration.log"),
  });
  if (result.exitCode !== 0) throw new Error(`E2E database migration failed:\n${result.output}`);
}

async function runSeedCommand(
  repositoryRoot: string,
  artifacts: string,
  env: NodeJS.ProcessEnv,
  mode: "template" | "restore",
  signal: AbortSignal,
) {
  const result = await runOwnedCommand({
    executable: process.execPath,
    args: ["--no-env-file", "src/seed-cli.ts", mode],
    cwd: join(repositoryRoot, "e2e/system"),
    env,
    signal,
    timeoutMs: 60_000,
    logFile: join(artifacts, mode === "template" ? "seed.log" : "restore.log"),
  });
  if (result.exitCode !== 0) {
    throw new Error(`E2E ${mode === "template" ? "seed" : "Redis restore"} failed:\n${result.output}`);
  }
}

async function publishContainerRoutes(options: {
  seedRunId: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  gatewayOrigin: string;
  apisixAdminUrl: string;
  signal: AbortSignal;
}) {
  console.log("[e2e] publish APISIX routes");
  const assets = new URL("../test-assets/", import.meta.url);
  const [yaml, cert, privateKey] = await Promise.all([
    readFile(iamGatewayManifest, "utf8"),
    readFile(new URL("wecom-mobile-cert.pem", assets), "utf8"),
    readFile(new URL("wecom-mobile-key.pem", assets), "utf8"),
  ]);
  await publishGateway({
    yaml,
    clientSecret: createE2EGatewayApiKey(options.seedRunId),
    gatewayOrigin: options.gatewayOrigin,
    adminUrl: options.apisixAdminUrl,
    adminKey: apisixAdminKey,
    wecomMobile: { authority: new URL(options.wecomMobileOrigin).host, cert, privateKey },
    variables: {
      APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
      IAM_SSO_INTERNAL_HOST: new URL(options.internalOrigin).host,
      IAM_SSO_EXTERNAL_HOST: new URL(options.origin).host,
      DEV_IAM_AUTH_API_UPSTREAM_HOST: "auth-api",
      DEV_IAM_AUTH_API_UPSTREAM_PORT: "30000",
      DEV_IAM_SSO_API_UPSTREAM_HOST: "sso-api",
      DEV_IAM_SSO_API_UPSTREAM_PORT: "30002",
      DEV_IAM_INTEGRATION_API_UPSTREAM_HOST: "integration-api",
      DEV_IAM_INTEGRATION_API_UPSTREAM_PORT: "30005",
      DEV_IAM_ADMIN_API_UPSTREAM_HOST: "admin-api",
      DEV_IAM_ADMIN_API_UPSTREAM_PORT: "30001",
      DEV_IAM_SSO_FRONTEND_UPSTREAM_HOST: "sso",
      DEV_IAM_SSO_FRONTEND_UPSTREAM_PORT: "80",
      DEV_IAM_ADMIN_FRONTEND_UPSTREAM_HOST: "admin",
      DEV_IAM_ADMIN_FRONTEND_UPSTREAM_PORT: "80",
      E2E_STUBS_UPSTREAM_HOST: "e2e-stubs",
      E2E_STUBS_UPSTREAM_PORT: String(e2eStubsHttpPort),
    },
    signal: options.signal,
  });
}

async function verifyRoutes(
  origins: Pick<E2ERunContext, "origin" | "internalOrigin" | "wecomMobileOrigin">,
  signal: AbortSignal,
) {
  for (const origin of [origins.origin, origins.internalOrigin]) {
    await probeHttpRoute(origin, "/portal/login", [200], signal);
    await probeHttpRoute(origin, "/iam-admin/", [200], signal);
    await probeHttpRoute(origin, "/api/iam/admin/users/search", [403], signal);
    await probeHttpRoute(origin, "/e2e/oidc/callback", [200], signal);
    await probeOidcDiscovery(origin, signal);
    await probeSsoConfiguration(origin, signal);
  }
  await probeHttpRoute(origins.wecomMobileOrigin, wecomMobileCallbackPath, [400], signal);
}

async function compose(run: ManagedResourceRun, stage: string, args: string[], signal: AbortSignal, timeoutMs: number) {
  console.log(`[e2e] ${stage}`);
  const result = await runManagedComposeCommand(run, args, { signal, timeoutMs, inheritOutput: true });
  if (result.exitCode !== 0) throw new Error(`E2E could not ${stage} (exit ${result.exitCode})`);
}

async function allocateDistinctPorts(count: number) {
  const allocated = new Set<number>();
  while (allocated.size < count) allocated.add(await allocateAvailablePort());
  return [...allocated];
}

function requireLinux(platform = process.platform) {
  if (platform !== "linux") {
    throw new Error(`Container E2E requires Linux (native Linux or WSL2). Current platform: ${platform}`);
  }
}
