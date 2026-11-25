import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ClientSsoCallbackType, ClientSsoProtocol, OrganizationType, SubjectClaim, UserType } from "@iam/contracts";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  type ManagedResourceRun,
  managedServiceEndpoint,
  runManagedComposeCommand,
  writeAtomicResourceRecord,
} from "../../../scripts/test-resources/managed-resources.mjs";
import {
  type OwnedCommandOptions,
  pnpmCommand,
  runOwnedCommand,
} from "../../../scripts/test-resources/owned-command.mjs";
import {
  containerSmokeApplications,
  containerSmokeImages,
  containerSmokeInfrastructure,
  createContainerSmokeCompose,
  smokeGatewayApiPort,
} from "../docker/container-smoke-compose.ts";
import { runWithCleanup } from "./bounded-operation.ts";
import { buildContainerSmokeImages, parseContainerSmokeBuildConcurrency } from "./container-smoke-build.ts";
import { createE2EGatewayApiKey } from "./gateway-credential.ts";
import { iamGatewayManifest, publishGateway } from "./gateway-sync.ts";
import { apisixAdminKey, e2eDatabaseName, e2eDatabasePassword } from "./hybrid-compose.ts";
import { allocateAvailablePort } from "./port-allocation.ts";
import { createE2EScenarioIdentity, createE2EScenarioInternalApiKey } from "./seed.ts";

export async function runContainerSmoke(options: {
  repositoryRoot: string;
  workspaceRoot: string;
  signal: AbortSignal;
}) {
  const { repositoryRoot, workspaceRoot, signal } = options;
  const runId = randomUUID();
  const project = `iam-e2e-smoke-${runId}`;
  const artifactDirectory = `test-results/integration/${project}`;
  const artifacts = join(repositoryRoot, artifactDirectory);
  const composeFile = `${artifactDirectory}/compose.json`;
  const gatewayPort = await allocateAvailablePort();
  const origin = `http://external.iam.localhost:${gatewayPort}`;
  const internalOrigin = `http://internal.iam.localhost:${gatewayPort}`;
  const { adminUsername, organizationCode, positionCode } = createE2EScenarioIdentity(runId);
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  await writeAtomicResourceRecord(
    join(repositoryRoot, composeFile),
    createContainerSmokeCompose({
      repositoryRoot,
      project,
      origin,
      internalOrigin,
      gatewayPort,
      adminClientCode: "iam-admin",
    }),
  );
  signal.throwIfAborted();
  const run = await createManagedResourceRun({
    root: repositoryRoot,
    composeFile,
    artifactDirectory,
    project,
    removeLocalImages: true,
    composeEnvironment: { COMPOSE_DISABLE_ENV_FILE: "1" },
    registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
  });
  console.log(`[container-smoke] Project ${project}; diagnostics ${artifacts}`);

  const buildConcurrency = parseContainerSmokeBuildConcurrency(process.env.IAM_CONTAINER_SMOKE_BUILD_CONCURRENCY);
  let passed = false;
  await runWithCleanup(
    async () => {
      console.log(`[container-smoke] build ${containerSmokeImages.length} images (concurrency ${buildConcurrency})`);
      const buildOutcomes = await buildContainerSmokeImages({
        services: containerSmokeImages,
        concurrency: buildConcurrency,
        signal,
        buildOne: async (service, buildSignal) => {
          const logPath = join(artifacts, `build-${service}.log`);
          const relativeLog = `${artifactDirectory}/build-${service}.log`;
          console.log(`[container-smoke] build ${service} started; log ${relativeLog}`);
          const started = performance.now();
          const result = await runManagedComposeCommand(run, ["build", service], {
            signal: buildSignal,
            timeoutMs: 20 * 60_000,
            fullLogFile: logPath,
          });
          if (result.exitCode !== 0) {
            const tail = result.output.trim().split(/\r?\n/u).slice(-40).join("\n");
            throw new Error(
              `Container Smoke could not build ${service} (exit ${result.exitCode}; log ${relativeLog})${tail ? `:\n${tail}` : ""}`,
            );
          }
          console.log(`[container-smoke] build ${service} passed in ${Math.round(performance.now() - started)} ms`);
          return { logPath: relativeLog };
        },
      });
      const totalBuildMs = buildOutcomes.reduce((sum, item) => sum + item.durationMs, 0);
      console.log(
        `[container-smoke] built ${buildOutcomes.length} images (sum ${totalBuildMs} ms across ${buildConcurrency} slots)`,
      );
      const start = (services: string[]) =>
        compose(
          run,
          `start ${services.join(", ")}`,
          ["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", ...services],
          signal,
          150_000,
        );
      await start(containerSmokeInfrastructure);
      const endpoint = (service: string, containerPort: number) =>
        managedServiceEndpoint(run, service, containerPort, { signal, timeoutMs: 10_000 });
      const postgres = await endpoint("postgres", 5432);
      const redis = await endpoint("redis", 6379);
      const apisixAdmin = await endpoint("apisix", 9180);
      const databaseUrl = `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@${postgres.host}:${postgres.port}/${e2eDatabaseName}`;
      await command("migrate", {
        ...pnpmCommand(process.env.npm_execpath ?? "pnpm", ["--filter", "@iam/db", "db:migrate"]),
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        signal,
        timeoutMs: 90_000,
      });
      await start(containerSmokeApplications);

      const smokeEnvironment = {
        ...process.env,
        IAM_E2E_ORIGIN: origin,
        IAM_E2E_ADMIN_USERNAME: adminUsername,
        IAM_E2E_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
        IAM_E2E_INTERNAL_API_KEY: createE2EScenarioInternalApiKey(runId),
        IAM_E2E_SMOKE_OUTPUT_DIR: join(artifacts, "playwright"),
      };
      const initializationInput = join(artifacts, "initialization.json");
      await writeAtomicResourceRecord(initializationInput, {
        admin: { username: adminUsername, name: "Container Smoke Admin", userType: UserType.External },
        organization: {
          orgCode: organizationCode,
          orgName: "Container Smoke Organization",
          orgType: OrganizationType.Company,
          isEntity: true,
          isVirtual: false,
        },
        position: { posCode: positionCode, posName: "Container Smoke Position" },
        adminRoleName: "Container Smoke Admin",
        clients: [
          ["iam", "/portal"],
          ["iam-admin", "/iam-admin"],
          ["gds", "/gds"],
        ].map(([clientCode, path]) => ({
          clientCode,
          clientName: clientCode,
          url: `${origin}${path}`,
          ssoConfig: {
            protocol: ClientSsoProtocol.CustomSso,
            callbackType: ClientSsoCallbackType.Managed,
            validRedirectUrls: [origin, internalOrigin].map((entryOrigin) => `${entryOrigin}${path}/*`),
            subjectClaims: [
              SubjectClaim.SubjectIdentifier,
              SubjectClaim.ProfileUsername,
              SubjectClaim.ProfileName,
              SubjectClaim.IamAuthorization,
            ],
          },
        })),
      });
      await initializeSmoke({
        repositoryRoot,
        initializationInput,
        signal,
        environment: {
          ...process.env,
          IAM_OPS_DATABASE_URL: databaseUrl,
          IAM_OPS_REDIS_URL: `redis://${redis.host}:${redis.port}/0`,
          IAM_INITIAL_ADMIN_PASSWORD: smokeEnvironment.IAM_E2E_ADMIN_PASSWORD,
          IAM_INITIAL_IAM_CLIENT_SECRET: createE2EGatewayApiKey(runId),
          IAM_INITIAL_IAM_SSO_SECRET: randomUUID(),
          IAM_INITIAL_ADMIN_CLIENT_SECRET: randomUUID(),
          IAM_INITIAL_ADMIN_SSO_SECRET: randomUUID(),
          IAM_INITIAL_GDS_CLIENT_SECRET: smokeEnvironment.IAM_E2E_INTERNAL_API_KEY,
          IAM_INITIAL_GDS_SSO_SECRET: randomUUID(),
        },
      });

      console.log("[container-smoke] publish APISIX routes");
      const gatewayApi = await endpoint("gateway-api", smokeGatewayApiPort);
      await publishGateway({
        yaml: await readFile(iamGatewayManifest, "utf8"),
        clientSecret: createE2EGatewayApiKey(runId),
        gatewayOrigin: `http://${gatewayApi.host}:${gatewayApi.port}`,
        adminUrl: `http://${apisixAdmin.host}:${apisixAdmin.port}/apisix/admin`,
        adminKey: apisixAdminKey,
        includeRpTerminals: false,
        variables: {
          APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
          IAM_SSO_INTERNAL_HOST: new URL(internalOrigin).host,
          IAM_SSO_EXTERNAL_HOST: new URL(origin).host,
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
        },
        signal,
      });
      await command("browser", {
        executable: "node",
        args: [
          join(workspaceRoot, "node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          "playwright.container-smoke.config.ts",
        ],
        cwd: workspaceRoot,
        env: smokeEnvironment,
        signal,
        timeoutMs: 120_000,
      });
      signal.throwIfAborted();
      passed = true;
    },
    () => finishManagedResourceRun(run, { cleanupTimeoutMs: 90_000, diagnostics: !passed || signal.aborted }),
  );
  signal.throwIfAborted();
}

async function initializeSmoke(options: {
  repositoryRoot: string;
  initializationInput: string;
  signal: AbortSignal;
  environment: NodeJS.ProcessEnv;
}) {
  const { repositoryRoot, initializationInput, signal, environment } = options;
  const initialize = (phase: "source" | "access", phaseSignal: AbortSignal): OwnedCommandOptions => ({
    ...pnpmCommand(process.env.npm_execpath ?? "pnpm", [
      "--filter",
      "@iam/ops",
      "iam-ops",
      "initialize",
      phase,
      "--input",
      initializationInput,
    ]),
    cwd: repositoryRoot,
    env: environment,
    signal: phaseSignal,
    timeoutMs: 60_000,
  });
  await command("initialize source", initialize("source", signal));

  console.log("[container-smoke] initialize access after Worker publication");
  const publication = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  while (true) {
    publication.throwIfAborted();
    const result = await runOwnedCommand(initialize("access", publication));
    if (result.exitCode === 0) return;
    if (!/^initialization-(postgres-publication|redis-facts)-pending$/mu.test(result.output)) {
      throw new Error(`Container Smoke could not initialize access (exit ${result.exitCode}):\n${result.output}`);
    }
    await delay(500, undefined, { signal: publication });
  }
}

async function compose(run: ManagedResourceRun, stage: string, args: string[], signal: AbortSignal, timeoutMs: number) {
  console.log(`[container-smoke] ${stage}`);
  const result = await runManagedComposeCommand(run, args, { signal, timeoutMs, inheritOutput: true });
  if (result.exitCode !== 0) throw new Error(`Container Smoke could not ${stage} (exit ${result.exitCode})`);
}

async function command(stage: string, options: OwnedCommandOptions) {
  console.log(`[container-smoke] ${stage}`);
  const result = await runOwnedCommand({ ...options, inheritOutput: true });
  if (result.exitCode !== 0) throw new Error(`Container Smoke ${stage} failed (exit ${result.exitCode})`);
}
