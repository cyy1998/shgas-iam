import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { runWithCleanup } from "./bounded-operation.ts";
import { startHostProcess } from "./host-process.ts";
import { apisixAdminKey } from "./hybrid-compose.ts";
import type { HybridRunContext } from "./hybrid-context.ts";
import type { HybridMiddleware } from "./hybrid-middleware.ts";
import { e2eLoginCredentialEnvironment } from "./login-credential-config.ts";
import { allocateAvailablePort } from "./port-allocation.ts";
import { wecomAgent, wecomCorp, wecomMobileCallbackPath, wecomSecret } from "./wecom-provider.ts";

const backendServices = ["api", "admin-api", "worker", "gateway-api"] as const;
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
  const [apiPort, adminApiPort, workerPort, gatewayApiPort] = ports;
  const origins = {
    api: `http://${hostname}:${apiPort}`,
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
      ([name]) => !/^IAM_(API|ADMIN_API|WORKER|GATEWAY)_/iu.test(name),
    ),
  );
  const common = { ...env, NODE_ENV: "development", DATABASE_URL: databaseUrl };
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "e2e-runtime-rs256", alg: "RS256", use: "sig" };

  return {
    api: {
      cwd: app("api"),
      args: [
        "--tsconfig-override",
        join(app("api"), "tsconfig.json"),
        join(options.repositoryRoot, "e2e/system/src/start-host-api.mts"),
      ],
      healthPath: "/sso/.well-known/authentication-configuration",
      env: {
        ...common,
        IAM_E2E_RUN_ID: options.seedRunId,
        IAM_E2E_SMS_DELIVERY_PATH: options.smsDeliveryPath,
        IAM_API_DATABASE_URL: databaseUrl,
        IAM_API_REDIS_URL: redisUrl,
        IAM_API_PORT: port("api"),
        IAM_API_LOG_FORMAT: "json",
        IAM_API_PASSWORD_HASH_ROUNDS: "10",
        IAM_API_MAGIC_CODE: "1234",
        IAM_API_CAP_ENABLED: "false",
        ...e2eLoginCredentialEnvironment,
        IAM_API_SESSION_KERNEL_NAMESPACE: "iam:session",
        IAM_API_OIDC_CURRENT_JWK_JSON: JSON.stringify(jwk),
        IAM_API_OIDC_COOKIE_SECURE: "false",
        IAM_API_WECHAT_CORP_ID: wecomCorp,
        IAM_API_WECHAT_CORP_SECRET: wecomSecret,
        IAM_API_WECHAT_QR_AGENT_ID: wecomAgent,
        IAM_API_WECHAT_QR_CALLBACK_URL: new URL(wecomMobileCallbackPath, options.wecomMobileOrigin).href,
        IAM_API_SMS_URL: "http://127.0.0.1:9/test-sms",
        IAM_API_SMS_SIGNATURE_KEY: "e2e-sms",
        IAM_API_USER_SESSION_TTL_SECONDS: "86400",
        IAM_API_CLIENT_SESSION_TTL_SECONDS: "86400",
        IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "86400",
        IAM_API_AUTH_CODE_TTL_SECONDS: "300",
        IAM_API_LOGIN_ENDPOINT: "/portal/login",
        IAM_API_SSO_INTERNAL_ORIGIN: options.internalOrigin,
        IAM_API_SSO_EXTERNAL_ORIGIN: options.origin,
        IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
        IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
        IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
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
