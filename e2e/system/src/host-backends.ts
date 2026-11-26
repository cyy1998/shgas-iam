import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { runWithCleanup } from "./bounded-operation.ts";
import { startHostProcess } from "./host-process.ts";
import type { HybridRunContext } from "./hybrid-context.ts";
import type { HybridMiddleware } from "./hybrid-middleware.ts";
import { e2eLoginCredentialEnvironment } from "./login-credential-config.ts";
import { apisixAdminKey } from "./middleware-compose.ts";
import { allocateAvailablePort } from "./port-allocation.ts";
import { wecomAgent, wecomCorp, wecomMobileCallbackPath, wecomSecret } from "./wecom-provider.ts";

const backendServices = ["auth-api", "sso-api", "integration-api", "admin-api", "worker", "gateway-api"] as const;
export type BackendService = (typeof backendServices)[number];
const hostname = "127.0.0.1";

type HostBackendsOptions = Pick<
  HybridRunContext,
  "origin" | "internalOrigin" | "wecomMobileOrigin" | "logDirectory" | "smsDeliveryPath"
> & {
  repositoryRoot: string;
  middleware: HybridMiddleware;
  seedRunId: string;
  adminClientCode: string;
};

type HostProcess = Awaited<ReturnType<typeof startHostProcess>>;

export async function createHostBackends(options: HostBackendsOptions) {
  const ports = new Set<number>();
  while (ports.size < backendServices.length) ports.add(await allocateAvailablePort());
  const [authApiPort, ssoApiPort, integrationApiPort, adminApiPort, workerPort, gatewayApiPort] = ports;
  const origins = {
    "auth-api": `http://${hostname}:${authApiPort}`,
    "sso-api": `http://${hostname}:${ssoApiPort}`,
    "integration-api": `http://${hostname}:${integrationApiPort}`,
    "admin-api": `http://${hostname}:${adminApiPort}`,
    worker: `http://${hostname}:${workerPort}`,
    "gateway-api": `http://${hostname}:${gatewayApiPort}`,
  };
  const commands = backendCommands(options, origins);
  const running = new Map<BackendService, HostProcess>();

  async function startService(service: BackendService, signal?: AbortSignal) {
    if (running.has(service)) return;
    running.set(
      service,
      await startHostProcess({
        service,
        ...commands[service],
        origin: origins[service],
        logDirectory: options.logDirectory,
        signal,
      }),
    );
  }

  async function stopService(service: BackendService) {
    const process = running.get(service);
    if (!process) return;
    await process.stop();
    running.delete(service);
  }

  const stop = () => settleBackends(backendServices.map(stopService), "E2E backend shutdown failed");
  return {
    origins,
    start: (signal?: AbortSignal) => startAll(signal),
    stop,
    stopWorker: () => stopService("worker"),
    startWorker: (signal?: AbortSignal) => startService("worker", signal),
  };

  async function startAll(parentSignal?: AbortSignal) {
    const failed = new AbortController();
    const signal = parentSignal ? AbortSignal.any([parentSignal, failed.signal]) : failed.signal;
    let started = false;
    await runWithCleanup(
      async () => {
        await settleBackends(
          backendServices.map((service) =>
            startService(service, signal).catch((error: unknown) => {
              failed.abort(error);
              throw error;
            }),
          ),
          "E2E backend startup failed",
        );
        signal.throwIfAborted();
        started = true;
      },
      async () => {
        if (!started) await stop();
      },
    );
  }
}

async function settleBackends(operations: Promise<void>[], message: string) {
  const results = await Promise.allSettled(operations);
  const failures = [...new Set(results.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])))];
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, message);
}

function backendCommands(options: HostBackendsOptions, origins: Record<BackendService, string>) {
  const { databaseUrl, redisUrl, apisixAdminUrl } = options.middleware;
  const app = (name: string) => join(options.repositoryRoot, "apps", name);
  const port = (service: BackendService) => new URL(origins[service]).port;
  const env = Object.fromEntries(
    Object.entries(options.middleware.hostEnvironment).filter(
      ([name]) => !/^IAM_(API|AUTH_API|SSO_API|INTEGRATION_API|ADMIN_API|WORKER|GATEWAY)_/iu.test(name),
    ),
  );
  const common = { ...env, NODE_ENV: "development", DATABASE_URL: databaseUrl };
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "e2e-runtime-rs256", alg: "RS256", use: "sig" };

  return {
    "auth-api": {
      cwd: app("auth-api"),
      args: [
        "--tsconfig-override",
        join(app("auth-api"), "tsconfig.json"),
        join(options.repositoryRoot, "e2e/system/src/start-host-auth-api.mts"),
      ],
      healthPath: "/ready",
      env: {
        ...common,
        IAM_E2E_RUN_ID: options.seedRunId,
        IAM_E2E_SMS_DELIVERY_PATH: options.smsDeliveryPath,
        IAM_AUTH_API_DATABASE_URL: databaseUrl,
        IAM_AUTH_API_REDIS_URL: redisUrl,
        IAM_AUTH_API_PORT: port("auth-api"),
        IAM_AUTH_API_LOG_FORMAT: "json",
        IAM_AUTH_API_MAGIC_CODE: "1234",
        IAM_AUTH_API_CAP_ENABLED: "false",
        ...e2eLoginCredentialEnvironment,
        IAM_AUTH_API_WECHAT_CORP_ID: wecomCorp,
        IAM_AUTH_API_WECHAT_CORP_SECRET: wecomSecret,
        IAM_AUTH_API_WECHAT_QR_AGENT_ID: wecomAgent,
        IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: new URL(wecomMobileCallbackPath, options.wecomMobileOrigin).href,
        IAM_AUTH_API_SMS_URL: "http://127.0.0.1:9/test-sms",
        IAM_AUTH_API_SMS_SIGNATURE_KEY: "e2e-sms",
        IAM_AUTH_API_SSO_INTERNAL_ORIGIN: options.internalOrigin,
        IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: options.origin,
      },
    },
    "sso-api": {
      cwd: app("sso-api"),
      args: ["src/index.ts"],
      healthPath: "/ready",
      env: {
        ...common,
        IAM_SSO_API_DATABASE_URL: databaseUrl,
        IAM_SSO_API_REDIS_URL: redisUrl,
        IAM_SSO_API_PORT: port("sso-api"),
        IAM_SSO_API_HOSTNAME: hostname,
        IAM_SSO_API_LOG_FORMAT: "json",
        IAM_SSO_API_OIDC_CURRENT_JWK_JSON: JSON.stringify(jwk),
        IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
        IAM_SSO_API_WECHAT_QR_ENABLED: "true",
        IAM_SSO_API_SSO_INTERNAL_ORIGIN: options.internalOrigin,
        IAM_SSO_API_SSO_EXTERNAL_ORIGIN: options.origin,
      },
    },
    "integration-api": {
      cwd: app("integration-api"),
      args: ["src/index.ts"],
      healthPath: "/ready",
      env: {
        ...common,
        IAM_INTEGRATION_API_DATABASE_URL: databaseUrl,
        IAM_INTEGRATION_API_REDIS_URL: redisUrl,
        IAM_INTEGRATION_API_PORT: port("integration-api"),
        IAM_INTEGRATION_API_HOSTNAME: hostname,
        IAM_INTEGRATION_API_LOG_FORMAT: "json",
      },
    },
    "admin-api": {
      cwd: app("admin-api"),
      args: ["src/index.ts"],
      healthPath: "/admin/users/search",
      healthStatus: 403,
      env: {
        ...common,
        IAM_ADMIN_API_DATABASE_URL: databaseUrl,
        IAM_ADMIN_API_REDIS_URL: redisUrl,
        IAM_ADMIN_API_HOSTNAME: hostname,
        IAM_ADMIN_API_PORT: port("admin-api"),
        IAM_ADMIN_API_LOG_FORMAT: "json",
        IAM_ADMIN_API_ADMIN_CLIENT_CODES: options.adminClientCode,
        IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: "iam:session",
      },
    },
    worker: {
      cwd: app("worker"),
      args: ["src/index.ts"],
      healthPath: "/healthz",
      env: {
        ...common,
        IAM_WORKER_DATABASE_URL: databaseUrl,
        IAM_WORKER_REDIS_URL: redisUrl,
        IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
        IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
        IAM_WORKER_HTTP_ENABLED: "true",
        IAM_WORKER_HTTP_HOSTNAME: hostname,
        IAM_WORKER_HTTP_PORT: port("worker"),
        IAM_WORKER_HEALTH_PATH: "/healthz",
        IAM_WORKER_BULL_BOARD_ENABLED: "false",
        IAM_WORKER_LOG_FORMAT: "json",
      },
    },
    "gateway-api": {
      cwd: app("gateway"),
      args: ["src/main.ts"],
      healthPath: "/health",
      env: {
        ...common,
        IAM_GATEWAY_DATABASE_URL: databaseUrl,
        IAM_GATEWAY_APISIX_ADMIN_URL: apisixAdminUrl,
        IAM_GATEWAY_APISIX_ADMIN_KEY: apisixAdminKey,
        IAM_GATEWAY_HOSTNAME: hostname,
        IAM_GATEWAY_PORT: port("gateway-api"),
      },
    },
  };
}
