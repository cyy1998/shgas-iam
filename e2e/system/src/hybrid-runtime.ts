import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { runWithCleanup } from "./bounded-operation.ts";
import { prepareE2EDatabaseTemplate } from "./database-template.ts";
import { startFrontendServers } from "./frontend/frontend-servers.ts";
import { createE2EGatewayApiKey } from "./gateway-credential.ts";
import { iamGatewayManifest, publishGateway } from "./gateway-sync.ts";
import { createHostBackends } from "./host-backends.ts";
import { createStageMemoryProfile, type StageMemoryProfile } from "./host-memory.ts";
import { probeHttpRoute, probeOidcDiscovery, probeSsoConfiguration } from "./http-probes.ts";
import { type HybridLifecycle, hybridUpstreamHost, selectHybridLifecycle } from "./hybrid-compose.ts";
import type { HybridRunContext } from "./hybrid-context.ts";
import { createHybridControl } from "./hybrid-control.ts";
import { type HybridMiddleware, withHybridMiddleware } from "./hybrid-middleware.ts";
import { apisixAdminKey } from "./middleware-compose.ts";
import { createE2EScenarioInternalApiKey } from "./seed.ts";
import { wecomMobileCallbackPath } from "./wecom-provider.ts";

interface HybridRuntimeOptions {
  repositoryRoot: string;
  artifactRoot: string;
  fresh?: boolean;
  keep?: boolean;
  lifecycle?: HybridLifecycle;
  residentDirectory?: string;
  devFrontend?: boolean;
  signal?: AbortSignal;
  startupTimeoutMs?: number;
}

const adminPassword = "iam-e2e-admin-password-local-only";

export async function withHybridRuntime<T>(
  options: HybridRuntimeOptions,
  use: (contextPath: string, signal: AbortSignal, hostEnvironment: NodeJS.ProcessEnv) => Promise<T>,
) {
  const lifecycle = selectHybridLifecycle(options);
  const runId = randomUUID();
  const artifactDirectory = resolve(options.artifactRoot, runId);
  const interruption = new AbortController();
  const signal = AbortSignal.any([interruption.signal, ...(options.signal ? [options.signal] : [])]);
  const interrupt = () => interruption.abort(new Error("E2E runtime received SIGINT"));
  const terminate = () => interruption.abort(new Error("E2E runtime received SIGTERM"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const deadline = new AbortController();
  const timeoutMs = options.startupTimeoutMs ?? 360_000;
  const timer = setTimeout(() => deadline.abort(new Error(`E2E startup timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const startup = AbortSignal.any([signal, deadline.signal]);
    startup.throwIfAborted();
    await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
    const memory = createStageMemoryProfile();
    memory.enter("infrastructure");
    return await runWithCleanup(
      () =>
        withHybridMiddleware({ ...options, lifecycle, signal: startup }, (middleware) =>
          runHybridRuntime(
            { ...options, runId, artifactDirectory, memory },
            middleware,
            startup,
            signal,
            (contextPath, activeSignal, hostEnvironment) => {
              clearTimeout(timer);
              return use(contextPath, activeSignal, hostEnvironment);
            },
          ),
        ),
      () => memory.finish(artifactDirectory),
    );
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

async function runHybridRuntime<T>(
  options: HybridRuntimeOptions & { runId: string; artifactDirectory: string; memory: StageMemoryProfile },
  middleware: HybridMiddleware,
  startup: AbortSignal,
  signal: AbortSignal,
  use: (contextPath: string, signal: AbortSignal, hostEnvironment: NodeJS.ProcessEnv) => Promise<T>,
) {
  startup.throwIfAborted();
  const { artifactDirectory, memory, repositoryRoot, runId } = options;
  const logDirectory = join(artifactDirectory, "logs");
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const contextPath = join(artifactDirectory, "runtime-context.json");
  const smsDeliveryPath = join(artifactDirectory, "sms-delivery");
  const origin = `http://external.iam.localhost:${middleware.ports.http}`;
  const internalOrigin = `http://internal.iam.localhost:${middleware.ports.http}`;
  const wecomMobileOrigin = `https://external.iam.localhost:${middleware.ports.https}`;

  memory.enter("migration");
  const baseline = await prepareE2EDatabaseTemplate({
    repositoryRoot,
    artifactDirectory,
    middleware,
    canonicalOrigin: origin,
    internalOrigin,
    adminPassword,
    signal: startup,
    onSeedStart: () => memory.enter("seed"),
  });
  const references = await baseline.reset(startup);
  memory.enter("build");
  const frontends = await startFrontendServers({
    repoRoot: repositoryRoot,
    hostEnvironment: middleware.hostEnvironment,
    adminClientCode: references.adminClientCode,
    devFrontend: options.devFrontend,
    signal: startup,
  });
  return await runWithCleanup(async () => {
    memory.enter("application-startup");
    const ids = { origin, internalOrigin, wecomMobileOrigin, logDirectory, smsDeliveryPath };
    const backends = await createHostBackends({
      ...ids,
      repositoryRoot,
      middleware,
      seedRunId: references.runId,
      adminClientCode: references.adminClientCode,
    });
    const stopBackends = () => {
      memory.enter("cleanup");
      return backends.stop();
    };
    return await runWithCleanup(async () => {
      await backends.start(startup);
      memory.enter("gateway-readiness");
      await publishHybridRoutes({
        middleware,
        seedRunId: references.runId,
        origin,
        internalOrigin,
        wecomMobileOrigin,
        upstreams: {
          AUTH_API: backends.origins["auth-api"],
          SSO_API: backends.origins["sso-api"],
          INTEGRATION_API: backends.origins["integration-api"],
          ADMIN_API: backends.origins["admin-api"],
          SSO_FRONTEND: frontends.origins.sso,
          ADMIN_FRONTEND: frontends.origins.admin,
        },
        gatewayOrigin: backends.origins["gateway-api"],
        signal: startup,
      });
      await verifyRoutes(ids, startup);

      const token = randomBytes(32).toString("base64url");
      const control = createHybridControl({
        token,
        async reset(_file, controlSignal) {
          const resetSignal = AbortSignal.any([signal, controlSignal, AbortSignal.timeout(100_000)]);
          await backends.stop();
          resetSignal.throwIfAborted();
          await rm(smsDeliveryPath, { force: true });
          const restored = await baseline.reset(resetSignal);
          let ready = false;
          await runWithCleanup(
            async () => {
              await backends.start(resetSignal);
              await verifyRoutes(ids, resetSignal);
              resetSignal.throwIfAborted();
              const refreshed = { ...context, references: restored, resetCount: context.resetCount + 1 };
              await writeAtomicJsonFile(contextPath, refreshed, 0o600);
              context = refreshed;
              ready = true;
            },
            async () => {
              if (!ready) await backends.stop();
            },
          );
        },
        stopWorker: backends.stopWorker,
        startWorker: (controlSignal) => backends.startWorker(AbortSignal.any([signal, controlSignal])),
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
      let context: HybridRunContext = {
        ...ids,
        version: 1,
        runId,
        project: middleware.project,
        apisixComposeFile: middleware.composeFile,
        databaseUrl: middleware.databaseUrl,
        redisUrl: middleware.redisUrl,
        adminPassword,
        internalApiKey: createE2EScenarioInternalApiKey(references.runId),
        references,
        backendOrigins: backends.origins,
        frontendOrigins: frontends.origins,
        control: { origin: server.url.origin, token },
        resetCount: 0,
      };
      return await runWithCleanup(
        async () => {
          startup.throwIfAborted();
          await writeAtomicJsonFile(contextPath, context, 0o600);
          startup.throwIfAborted();
          memory.enter("browser");
          const result = await use(contextPath, signal, middleware.hostEnvironment);
          signal.throwIfAborted();
          return result;
        },
        async () => {
          // Interrupt and settle reset/start before stopping the process owner or unlocking the stack.
          const closed = control.close();
          await runWithCleanup(
            () => server.stop(true),
            () => closed,
          );
        },
      );
    }, stopBackends);
  }, frontends.stop);
}

interface PublishHybridRoutesOptions {
  middleware: HybridMiddleware;
  seedRunId: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  gatewayOrigin: string;
  upstreams: Record<string, string>;
  signal: AbortSignal;
}

async function publishHybridRoutes(options: PublishHybridRoutesOptions) {
  const { middleware, signal } = options;
  const variables: Record<string, string> = {
    APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
    IAM_SSO_INTERNAL_HOST: new URL(options.internalOrigin).host,
    IAM_SSO_EXTERNAL_HOST: new URL(options.origin).host,
  };
  for (const [name, origin] of Object.entries(options.upstreams)) {
    const port = new URL(origin).port;
    await middleware.probeUpstream({ service: name.toLowerCase().replaceAll("_", "-"), port: Number(port) }, signal);
    variables[`DEV_IAM_${name}_UPSTREAM_HOST`] = hybridUpstreamHost;
    variables[`DEV_IAM_${name}_UPSTREAM_PORT`] = port;
  }
  const assets = new URL("../test-assets/", import.meta.url);
  const [yaml, cert, privateKey] = await Promise.all([
    readFile(iamGatewayManifest, "utf8"),
    readFile(new URL("wecom-mobile-cert.pem", assets), "utf8"),
    readFile(new URL("wecom-mobile-key.pem", assets), "utf8"),
  ]);
  await publishGateway({
    yaml,
    variables,
    clientSecret: createE2EGatewayApiKey(options.seedRunId),
    gatewayOrigin: options.gatewayOrigin,
    adminUrl: middleware.apisixAdminUrl,
    adminKey: apisixAdminKey,
    wecomMobile: { authority: new URL(options.wecomMobileOrigin).host, cert, privateKey },
    signal,
  });
}

async function verifyRoutes(
  origins: Pick<HybridRunContext, "origin" | "internalOrigin" | "wecomMobileOrigin">,
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
