import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ClientSsoCallbackType, ClientSsoProtocol, OrganizationType, SubjectClaim, UserType } from "@iam/contracts";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  type ManagedResourceRun,
  managedServicePort,
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
import { createE2EGatewayApiKey } from "./gateway-credential.ts";
import { publishGateway } from "./gateway-sync.ts";
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

  await runWithCleanup(
    async () => {
      for (const service of containerSmokeImages) {
        await compose(run, `build ${service}`, ["build", service], signal, 20 * 60_000);
      }
      const start = (services: string[]) =>
        compose(
          run,
          `start ${services.join(", ")}`,
          ["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", ...services],
          signal,
          150_000,
        );
      await start(containerSmokeInfrastructure);
      const port = (service: string, containerPort: number) =>
        managedServicePort(run, service, containerPort, { signal, timeoutMs: 10_000 });
      const postgres = await port("postgres", 5432);
      const redis = await port("redis", 6379);
      const apisixAdmin = await port("apisix", 9180);
      const databaseUrl = `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@127.0.0.1:${postgres}/${e2eDatabaseName}`;
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
          IAM_OPS_REDIS_URL: `redis://127.0.0.1:${redis}/0`,
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
      const gatewayApi = await port("gateway-api", smokeGatewayApiPort);
      await publishGateway({
        yaml: await readFile(resolve(workspaceRoot, "test-assets/iam.yaml"), "utf8"),
        clientSecret: createE2EGatewayApiKey(runId),
        gatewayOrigin: `http://127.0.0.1:${gatewayApi}`,
        adminUrl: `http://127.0.0.1:${apisixAdmin}/apisix/admin`,
        adminKey: apisixAdminKey,
        includeRpTerminals: false,
        variables: {
          APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
          IAM_SSO_INTERNAL_HOST: new URL(internalOrigin).host,
          IAM_SSO_EXTERNAL_HOST: new URL(origin).host,
          DEV_IAM_API_UPSTREAM_HOST: "api",
          DEV_IAM_API_UPSTREAM_PORT: "30000",
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
    },
    () => finishManagedResourceRun(run, { cleanupTimeoutMs: 90_000 }),
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
