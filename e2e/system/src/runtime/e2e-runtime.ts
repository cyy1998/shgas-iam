import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { redisUrlString } from "@iam/runtime/redis/config";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import Redis from "ioredis";
import { pnpmCommand, runOwnedCommand } from "../../../../scripts/owned-command.mjs";
import {
  createE2EGatewayApiKey,
  createE2EScenarioIdentity,
  createE2EScenarioInternalApiKey,
  seedE2EScenario,
} from "../seed/seed.ts";
import { createProductionE2EScenarioOwner } from "../seed/seed-owner.ts";
import { wecomMobileCallbackPath } from "../stubs/wecom-provider.ts";
import {
  cleanupComposeRun,
  createE2EComposeRun,
  type E2EComposeRun,
  finishE2EComposeRun,
  readE2EComposeRun,
  resolveComposeEndpoint,
  runComposeCommand,
  writeAtomicResourceRecord,
} from "./compose-runtime.ts";
import { type E2ERedisSnapshotEntry, type E2ERunContext, runE2ECompose } from "./e2e-context.ts";
import { iamGatewayManifest, publishGateway } from "./gateway-sync.ts";
import { waitForHttpRoute } from "./http-probes.ts";

export interface E2ERuntimeOptions {
  repositoryRoot: string;
  skipBuild?: boolean;
  keep?: boolean;
  signal?: AbortSignal;
  startupTimeoutMs?: number;
}

const resourcePrefix = "test-results/e2e";
const cacheComposeFile = "e2e/system/docker-compose.e2e.gha-cache.yml";
const infrastructureServices = ["postgres", "redis", "apisix-etcd", "apisix", "e2e-stubs"];
const applicationServices = ["auth-api", "sso-api", "integration-api", "admin-api", "gateway-api", "admin", "sso"];
const buildServices = ["apisix", "e2e-stubs", "worker", ...applicationServices];
const e2eStubsHttpPort = 8080;
const apisixAdminKey = "dev-local-admin-key-change-me";
const adminPassword = "iam-e2e-admin-password-local-only";

export async function withE2ERuntime<T>(
  options: E2ERuntimeOptions,
  use: (contextPath: string, signal: AbortSignal) => Promise<T>,
) {
  if (process.platform !== "linux") throw new Error(`Container E2E requires Linux (current: ${process.platform})`);
  const { repositoryRoot } = options;
  const runId = randomUUID();
  const project = `iam-e2e-${runId.replaceAll("-", "")}`;
  const artifactDirectory = `${resourcePrefix}/${project}`;
  const artifacts = join(repositoryRoot, artifactDirectory);
  const contextPath = join(artifacts, "runtime-context.json");
  const pgSnapshotPath = join(artifacts, "seed-data.sql");
  const redisSnapshotPath = join(artifacts, "seed-redis.json");

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
    const httpPort = await allocateAvailablePort();
    let httpsPort = await allocateAvailablePort();
    while (httpsPort === httpPort) httpsPort = await allocateAvailablePort();
    const origin = `http://external.iam.localhost:${httpPort}`;
    const internalOrigin = `http://internal.iam.localhost:${httpPort}`;
    const wecomMobileOrigin = `https://external.iam.localhost:${httpsPort}`;
    const stubsToken = randomBytes(32).toString("base64url");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...privateKey.export({ format: "jwk" }), kid: "e2e-runtime-rs256", alg: "RS256", use: "sig" };
    const concurrency = process.env.IAM_E2E_BUILD_CONCURRENCY?.trim() || "2";
    if (!/^[1-4]$/u.test(concurrency)) throw new Error("IAM_E2E_BUILD_CONCURRENCY requires an integer from 1 to 4");

    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    const run = await createE2EComposeRun({
      root: repositoryRoot,
      artifactDirectory,
      project,
      removeLocalImages: !options.skipBuild,
      keep: Boolean(options.keep),
      composeEnvironment: {
        COMPOSE_DISABLE_ENV_FILE: "1",
        DOCKER_BUILDKIT: "1",
        COMPOSE_PARALLEL_LIMIT: concurrency,
        E2E_PROJECT: project,
        E2E_HTTP_PORT: String(httpPort),
        E2E_HTTPS_PORT: String(httpsPort),
        E2E_ORIGIN: origin,
        E2E_INTERNAL_ORIGIN: internalOrigin,
        E2E_WECOM_MOBILE_ORIGIN: wecomMobileOrigin,
        E2E_RUN_ID: runId,
        E2E_STUBS_TOKEN: stubsToken,
        E2E_OIDC_JWK_JSON: JSON.stringify(jwk),
        E2E_IMAGE_TAG: options.skipBuild ? "local" : project,
        E2E_ADMIN_CLIENT_CODE: createE2EScenarioIdentity(runId).adminClientCode,
        IAM_E2E_POSTGRES_IMAGE: process.env.IAM_E2E_POSTGRES_IMAGE ?? "",
        IAM_E2E_REDIS_IMAGE: process.env.IAM_E2E_REDIS_IMAGE ?? "",
        IAM_E2E_ETCD_IMAGE: process.env.IAM_E2E_ETCD_IMAGE ?? "",
        IAM_E2E_APISIX_BASE_IMAGE: process.env.IAM_E2E_APISIX_BASE_IMAGE ?? "",
        IAM_E2E_BUN_IMAGE: process.env.IAM_E2E_BUN_IMAGE ?? "",
      },
    });
    console.log(`[e2e] Project ${project}; diagnostics ${artifacts}`);

    let passed = false;
    return await runWithOwnedTestResources(async ({ registerCleanup }) => {
      registerCleanup(() =>
        finishE2EComposeRun(run, { cleanupTimeoutMs: 120_000, diagnostics: !passed || signal.aborted }),
      );
      await prepareImages(run, options.skipBuild, concurrency, startup);

      await startServices(run, infrastructureServices, startup);
      const endpoint = (service: string, containerPort: number) =>
        resolveComposeEndpoint(run, service, containerPort, { signal: startup, timeoutMs: 10_000 });
      const [postgres, redis, apisixAdmin, stubs] = await Promise.all([
        endpoint("postgres", 5432),
        endpoint("redis", 6379),
        endpoint("apisix", 9180),
        endpoint("e2e-stubs", e2eStubsHttpPort),
      ]);
      const databaseUrl = `postgresql://iam_e2e:iam_e2e_local_password@${postgres.host}:${postgres.port}/iam_e2e`;
      const redisUrl = `redis://${redis.host}:${redis.port}/0`;

      console.log("[e2e] migrate database");
      const migration = await runOwnedCommand({
        ...pnpmCommand(process.env.npm_execpath ?? "pnpm", ["--filter", "@iam/db", "db:migrate"]),
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        signal: startup,
        timeoutMs: 90_000,
        logFile: join(artifacts, "migration.log"),
      });
      if (migration.exitCode !== 0) throw new Error(`E2E database migration failed:\n${migration.output}`);

      await startServices(run, ["worker"], startup);
      console.log("[e2e] seed scenario and capture PostgreSQL and Redis snapshots");
      const references = await seedAndCapture(run, {
        runId,
        origin,
        internalOrigin,
        databaseUrl,
        redisUrl,
        pgSnapshotPath,
        redisSnapshotPath,
        signal: startup,
      });

      await startServices(run, applicationServices, startup);
      const gateway = await endpoint("gateway-api", 30004);
      await publishContainerRoutes({
        seedRunId: references.runId,
        origin,
        internalOrigin,
        wecomMobileOrigin,
        gatewayOrigin: `http://${gateway.host}:${gateway.port}`,
        apisixAdminUrl: `http://${apisixAdmin.host}:${apisixAdmin.port}/apisix/admin`,
        signal: startup,
      });
      await verifyRoutes({ origin, internalOrigin, wecomMobileOrigin }, startup);

      const context: E2ERunContext = {
        version: 3,
        runId,
        project,
        projectDirectory: repositoryRoot,
        resourceRecordPath: run.recordPath,
        origin,
        internalOrigin,
        wecomMobileOrigin,
        stubsOrigin: `http://${stubs.host}:${stubs.port}`,
        stubsToken,
        databaseUrl,
        redisUrl,
        pgSnapshotPath,
        redisSnapshotPath,
        adminPassword,
        internalApiKey: createE2EScenarioInternalApiKey(references.runId),
        references,
      };
      startup.throwIfAborted();
      await writeAtomicResourceRecord(contextPath, context);
      clearTimeout(timer);
      const result = await use(contextPath, signal);
      signal.throwIfAborted();
      passed = true;
      return result;
    });
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

export async function cleanupE2EProject(repositoryRoot: string, project: string) {
  if (!/^iam-e2e-[a-f0-9]{32}$/u.test(project)) throw new Error("An exact iam-e2e-<uuid> project is required");
  const artifactDirectory = `${resourcePrefix}/${project}`;
  const run = await readE2EComposeRun(repositoryRoot, `${artifactDirectory}/run.json`);
  if (run.record.project !== project) {
    throw new Error(`E2E resource record does not name the requested exact project ${project}`);
  }
  await cleanupComposeRun(run, { timeoutMs: 120_000 });
}

async function prepareImages(
  run: E2EComposeRun,
  skipBuild: boolean | undefined,
  concurrency: string,
  signal: AbortSignal,
) {
  const docker = (args: string[]) =>
    runOwnedCommand({ executable: "docker", args, cwd: run.root, signal, timeoutMs: 10_000 });
  const localImages = buildServices.map((service) => `iam-e2e-${service}:local`);
  if (skipBuild) {
    const missing: string[] = [];
    for (const image of localImages) {
      const result = await docker(["image", "inspect", "--format", "{{.Id}}", image]);
      if (result.exitCode !== 0) missing.push(image);
    }
    if (missing.length > 0) {
      throw new Error(
        `--skip-build requires local E2E images; missing: ${missing.join(", ")}. Run pnpm test:e2e without --skip-build first.`,
      );
    }
    console.log(`[e2e] --skip-build verified ${localImages.length} local images`);
    return;
  }

  const cache = process.env.IAM_E2E_BUILDX_CACHE?.trim().toLowerCase();
  if (cache && !["gha", "off", "none"].includes(cache)) {
    throw new Error("IAM_E2E_BUILDX_CACHE must be gha, off, or none");
  }
  const useGhaCache =
    cache === "gha" ||
    (!cache && process.env.CI === "true" && Boolean(process.env.ACTIONS_CACHE_URL || process.env.ACTIONS_RESULTS_URL));
  const logPath = join(run.root, run.record.artifactDirectory, "build.log");
  console.log(`[e2e] build ${buildServices.length} images (concurrency ${concurrency}); log ${logPath}`);
  const result = await runComposeCommand(
    run,
    [...(useGhaCache ? ["--file", join(run.root, cacheComposeFile)] : []), "build", ...buildServices],
    { signal, timeoutMs: 20 * 60_000, fullLogFile: logPath },
  );
  if (result.exitCode !== 0)
    throw new Error(`E2E image build failed; inspect ${logPath}\n${result.output.split("\n").slice(-40).join("\n")}`);
  for (const service of buildServices) {
    const local = `iam-e2e-${service}:local`;
    const tag = await docker(["tag", `iam-e2e-${service}:${run.record.project}`, local]);
    if (tag.exitCode !== 0) throw new Error(`E2E could not tag ${local}:\n${tag.output}`);
  }
}

async function startServices(run: E2EComposeRun, services: string[], signal: AbortSignal) {
  console.log(`[e2e] start ${services.join(", ")}`);
  const result = await runComposeCommand(
    run,
    ["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build", ...services],
    { signal, timeoutMs: 150_000, inheritOutput: true },
  );
  if (result.exitCode !== 0) throw new Error(`E2E could not start ${services.join(", ")} (exit ${result.exitCode})`);
}

const truncatePublicTables = `SET LOCAL lock_timeout = '10s';
DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO tables FROM pg_catalog.pg_tables WHERE schemaname = 'public';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`;

async function seedAndCapture(
  run: E2EComposeRun,
  options: Pick<
    E2ERunContext,
    "runId" | "origin" | "internalOrigin" | "databaseUrl" | "redisUrl" | "pgSnapshotPath" | "redisSnapshotPath"
  > & { signal: AbortSignal },
) {
  const queueRedis = redisUrlString().parse(options.redisUrl);
  const redis = new Redis({
    ...queueRedis,
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 10_000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = options.databaseUrl;
    const references = await runWithOwnedTestResources(async ({ registerCleanup }) => {
      registerCleanup(() => {
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousDatabaseUrl;
      });
      const { db, closeDb } = await import("@iam/db");
      registerCleanup(() => closeDb({ timeoutSeconds: 5 }));
      return await seedE2EScenario({
        owner: createProductionE2EScenarioOwner({
          db,
          redis,
          queueRedis,
          clock: { nowDate: () => new Date() },
          random: { uuid: randomUUID },
          passwordHashCost: 10,
        }),
        runId: options.runId,
        canonicalOrigin: options.origin,
        internalOrigin: options.internalOrigin,
        adminPassword,
        random: { uuid: randomUUID },
      });
    });

    const dump = await runE2ECompose(
      run,
      [
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "iam_e2e",
        "--schema=public",
        "--data-only",
        "--disable-triggers",
        "iam_e2e",
      ],
      { signal: options.signal, timeoutMs: 30_000 },
    );
    await writeFile(options.pgSnapshotPath, truncatePublicTables + dump, { mode: 0o600 });

    const entries = new Map<string, E2ERedisSnapshotEntry>();
    let cursor = "0";
    do {
      options.signal.throwIfAborted();
      const [next, keys] = await redis.scan(cursor, "COUNT", 100);
      cursor = next;
      for (const key of keys) {
        if (key.startsWith("bull:")) continue;
        const ttl = await redis.pttl(key);
        if (ttl === -2) continue;
        const value = await redis.dumpBuffer(key);
        if (value)
          entries.set(key, { key, ttlMs: ttl === -1 ? 0 : Math.max(1, ttl), valueBase64: value.toString("base64") });
      }
    } while (cursor !== "0");
    await writeAtomicResourceRecord(options.redisSnapshotPath, [...entries.values()]);
    return references;
  } finally {
    redis.disconnect();
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
  const assets = new URL("../../test-assets/", import.meta.url);
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
  const routes = [
    ["/portal/login", 200],
    ["/iam-admin/", 200],
    ["/api/iam/admin/users/search", 403],
    ["/e2e/oidc/callback", 200],
    ["/oidc/.well-known/openid-configuration", 200],
    ["/sso/.well-known/authentication-configuration", 200],
  ] as const;
  for (const origin of [origins.origin, origins.internalOrigin]) {
    for (const [path, status] of routes) await waitForHttpRoute(new URL(path, origin), status, signal);
  }
  const ca = await readFile(new URL("../../test-assets/wecom-mobile-cert.pem", import.meta.url), "utf8");
  await waitForHttpRoute(new URL(wecomMobileCallbackPath, origins.wecomMobileOrigin), 400, signal, ca);
}

async function allocateAvailablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!address || typeof address === "string") throw new Error("E2E could not allocate a loopback port");
  return address.port;
}
