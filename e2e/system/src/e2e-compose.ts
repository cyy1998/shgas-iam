import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { e2eLoginCredentialEnvironment } from "./login-credential-config.ts";
import {
  apisixAdminKey,
  apisixBuildContext,
  createE2EMiddlewareCompose,
  e2eDatabaseName,
  e2eDatabasePassword,
} from "./middleware-compose.ts";
import { smsSignatureKey } from "./sms-provider.ts";
import { wecomAgent, wecomCorp, wecomMobileCallbackPath, wecomSecret } from "./wecom-provider.ts";

export const e2eBuildServices = [
  "apisix",
  "e2e-stubs",
  "auth-api",
  "sso-api",
  "integration-api",
  "admin-api",
  "worker",
  "gateway-api",
  "admin",
  "sso",
] as const;

export const e2eInfrastructureServices = ["postgres", "redis", "apisix-etcd", "apisix", "e2e-stubs"] as const;
export const e2eResetBackendServices = ["auth-api", "sso-api", "integration-api", "admin-api", "worker"] as const;
export const e2eApplicationServices = [
  "auth-api",
  "sso-api",
  "integration-api",
  "admin-api",
  "worker",
  "gateway-api",
  "admin",
  "sso",
] as const;
export const e2eLogServices = [
  "auth-api",
  "sso-api",
  "integration-api",
  "admin-api",
  "worker",
  "gateway-api",
  "e2e-stubs",
] as const;

export const e2eGatewayApiPort = 30004;
export const e2eStubsHttpPort = 8080;
export const e2eStubsCaMountPath = "/etc/e2e-ca/ca.pem";
export const e2eStubsBuildContext = "e2e/system";
export const e2eStubsDockerfile = "docker/e2e-stubs/Dockerfile";

const internalDatabaseUrl = `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@postgres:5432/${e2eDatabaseName}`;
const internalRedisUrl = "redis://redis:6379/0";
const stubsCaFile = new URL("../test-assets/e2e-stubs-ca.pem", import.meta.url);

export const ssoTestLoginCredential = {
  IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary",
  IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY:
    "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
} as const;

export type E2EBuildxCacheMode = "gha" | "none";

export function e2eLocalImageTag(service: string) {
  return `iam-e2e-${service}:local`;
}

export function resolveBuildxCacheMode(env: NodeJS.ProcessEnv = process.env): E2EBuildxCacheMode {
  const configured = env.IAM_E2E_BUILDX_CACHE?.trim().toLowerCase();
  if (configured === "gha") return "gha";
  if (configured === "off" || configured === "none") return "none";
  if (configured) {
    throw new Error(`IAM_E2E_BUILDX_CACHE must be gha, off, or none; received "${env.IAM_E2E_BUILDX_CACHE}"`);
  }
  return env.CI === "true" && (Boolean(env.ACTIONS_CACHE_URL) || Boolean(env.ACTIONS_RESULTS_URL)) ? "gha" : "none";
}

export function frontendBuildArgs(app: "admin" | "sso", adminClientCode = "iam-admin"): Record<string, string> {
  if (app === "admin") {
    return {
      IAM_ADMIN_WEB_API_PREFIX: "/api/iam",
      IAM_ADMIN_WEB_SSO_AUTHORIZE_URL: "/sso/authorize",
      IAM_ADMIN_WEB_SSO_LOGOUT_URL: "/sso/logout",
      IAM_ADMIN_WEB_CLIENT_CODE: adminClientCode,
      IAM_ADMIN_WEB_GRAFANA_URL: "",
      IAM_ADMIN_WEB_SYSTEM_LOG_ENV: "e2e",
    };
  }
  return {
    IAM_SSO_WEB_API_PREFIX: "/api/iam",
    IAM_SSO_WEB_CLIENT_CODE: "iam",
    IAM_SSO_WEB_CAP_SITE_KEY: "iam-sso",
    IAM_SSO_WEB_CAP_ENDPOINT: "/api/iam/auth/captcha/cap/iam-sso/",
    IAM_SSO_WEB_CAP_WASM_URL: "/portal/cap/cap_wasm_bg.wasm",
    IAM_SSO_WEB_CAP_PAKO_URL: "/portal/cap/pako_inflate.min.js",
    ...ssoTestLoginCredential,
    IAM_SSO_WEB_WELL_KNOWN_URL: "/sso/.well-known/authentication-configuration",
  };
}

export interface E2EComposeOptions {
  project: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  httpPort: number;
  httpsPort: number;
  seedRunId: string;
  stubsToken: string;
  adminClientCode?: string;
  stubsCaPem?: string;
  env?: NodeJS.ProcessEnv;
}

export function createE2ECompose(options: E2EComposeOptions) {
  const {
    project,
    origin,
    internalOrigin,
    wecomMobileOrigin,
    httpPort,
    httpsPort,
    seedRunId,
    stubsToken,
    adminClientCode = "iam-admin",
    env = process.env,
  } = options;
  const stubsCaPem = options.stubsCaPem ?? readFileSync(stubsCaFile, "utf8");
  const cacheMode = resolveBuildxCacheMode(env);
  const infrastructure = createE2EMiddlewareCompose({ project, env });
  const labels = infrastructure.services.postgres.labels;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "e2e-runtime-rs256", alg: "RS256", use: "sig" };

  return {
    ...infrastructure,
    configs: {
      "e2e-stubs-ca": { content: stubsCaPem },
    },
    services: {
      ...infrastructure.services,
      postgres: {
        ...infrastructure.services.postgres,
        ports: ["127.0.0.1:0:5432"],
      },
      redis: {
        ...infrastructure.services.redis,
        command: ["redis-server", "--save", "", "--appendonly", "no"],
        ports: ["127.0.0.1:0:6379"],
      },
      apisix: {
        ...infrastructure.services.apisix,
        image: e2eLocalImageTag("apisix"),
        build: withCache(
          "apisix",
          {
            context: apisixBuildContext,
            ...(env.IAM_E2E_APISIX_BASE_IMAGE ? { args: { APISIX_IMAGE: env.IAM_E2E_APISIX_BASE_IMAGE } } : {}),
          },
          cacheMode,
        ),
        ports: [`127.0.0.1:${httpPort}:9080`, `127.0.0.1:${httpsPort}:9443`, "127.0.0.1:0:9180"],
      },
      "e2e-stubs": {
        image: e2eLocalImageTag("e2e-stubs"),
        build: withCache(
          "e2e-stubs",
          {
            context: e2eStubsBuildContext,
            dockerfile: e2eStubsDockerfile,
            ...(env.IAM_E2E_BUN_IMAGE ? { args: { BUN_IMAGE: env.IAM_E2E_BUN_IMAGE } } : {}),
          },
          cacheMode,
        ),
        labels,
        ports: [`127.0.0.1:0:${e2eStubsHttpPort}`],
        networks: { default: { aliases: ["qyapi.weixin.qq.com"] } },
        environment: {
          IAM_E2E_WECOM_RUN_ID: seedRunId,
          IAM_E2E_STUBS_TOKEN: stubsToken,
        },
        healthcheck: httpHealth(e2eStubsHttpPort, "/health"),
      },
      "auth-api": {
        image: e2eLocalImageTag("auth-api"),
        build: withCache("auth-api", appImage("auth-api"), cacheMode),
        labels,
        configs: [{ source: "e2e-stubs-ca", target: e2eStubsCaMountPath }],
        healthcheck: httpHealth(30000, "/ready"),
        environment: {
          NODE_EXTRA_CA_CERTS: e2eStubsCaMountPath,
          IAM_AUTH_API_DATABASE_URL: internalDatabaseUrl,
          IAM_AUTH_API_REDIS_URL: internalRedisUrl,
          IAM_AUTH_API_LOG_FORMAT: "json",
          IAM_AUTH_API_MAGIC_CODE: "1234",
          IAM_AUTH_API_CAP_ENABLED: "false",
          ...e2eLoginCredentialEnvironment,
          IAM_AUTH_API_WECHAT_CORP_ID: wecomCorp,
          IAM_AUTH_API_WECHAT_CORP_SECRET: wecomSecret,
          IAM_AUTH_API_WECHAT_QR_AGENT_ID: wecomAgent,
          IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: new URL(wecomMobileCallbackPath, wecomMobileOrigin).href,
          IAM_AUTH_API_SMS_URL: `http://e2e-stubs:${e2eStubsHttpPort}/test-sms`,
          IAM_AUTH_API_SMS_SIGNATURE_KEY: smsSignatureKey,
          IAM_AUTH_API_SSO_INTERNAL_ORIGIN: internalOrigin,
          IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: origin,
        },
      },
      "sso-api": {
        image: e2eLocalImageTag("sso-api"),
        build: withCache("sso-api", appImage("sso-api"), cacheMode),
        labels,
        healthcheck: httpHealth(30002, "/ready"),
        environment: {
          IAM_SSO_API_DATABASE_URL: internalDatabaseUrl,
          IAM_SSO_API_REDIS_URL: internalRedisUrl,
          IAM_SSO_API_LOG_FORMAT: "json",
          IAM_SSO_API_OIDC_CURRENT_JWK_JSON: JSON.stringify(jwk),
          IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
          IAM_SSO_API_WECHAT_QR_ENABLED: "true",
          IAM_SSO_API_SSO_INTERNAL_ORIGIN: internalOrigin,
          IAM_SSO_API_SSO_EXTERNAL_ORIGIN: origin,
        },
      },
      "integration-api": {
        image: e2eLocalImageTag("integration-api"),
        build: withCache("integration-api", appImage("integration-api"), cacheMode),
        labels,
        healthcheck: httpHealth(30005, "/ready"),
        environment: {
          IAM_INTEGRATION_API_DATABASE_URL: internalDatabaseUrl,
          IAM_INTEGRATION_API_REDIS_URL: internalRedisUrl,
          IAM_INTEGRATION_API_LOG_FORMAT: "json",
          IAM_INTEGRATION_API_SMS_URL: "http://sms.example.invalid/test-sms",
          IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: smsSignatureKey,
        },
      },
      "admin-api": {
        image: e2eLocalImageTag("admin-api"),
        build: withCache("admin-api", appImage("admin-api"), cacheMode),
        labels,
        healthcheck: httpHealth(30001, "/admin/users/search", 403),
        environment: {
          IAM_ADMIN_API_DATABASE_URL: internalDatabaseUrl,
          IAM_ADMIN_API_REDIS_URL: internalRedisUrl,
          IAM_ADMIN_API_HOSTNAME: "0.0.0.0",
          IAM_ADMIN_API_LOG_FORMAT: "json",
          IAM_ADMIN_API_ADMIN_CLIENT_CODES: adminClientCode,
          IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: "iam:session",
        },
      },
      worker: {
        image: e2eLocalImageTag("worker"),
        build: withCache("worker", appImage("worker"), cacheMode),
        labels,
        healthcheck: httpHealth(30003, "/healthz"),
        environment: {
          IAM_WORKER_DATABASE_URL: internalDatabaseUrl,
          IAM_WORKER_REDIS_URL: internalRedisUrl,
          IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
          IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
          IAM_WORKER_HTTP_ENABLED: "true",
          IAM_WORKER_HTTP_HOSTNAME: "0.0.0.0",
          IAM_WORKER_HTTP_PORT: "30003",
          IAM_WORKER_HEALTH_PATH: "/healthz",
          IAM_WORKER_BULL_BOARD_ENABLED: "false",
          IAM_WORKER_LOG_FORMAT: "json",
        },
      },
      "gateway-api": {
        image: e2eLocalImageTag("gateway-api"),
        build: withCache("gateway-api", appImage("gateway"), cacheMode),
        labels,
        healthcheck: httpHealth(e2eGatewayApiPort, "/health"),
        ports: [`127.0.0.1:0:${e2eGatewayApiPort}`],
        environment: {
          IAM_GATEWAY_DATABASE_URL: internalDatabaseUrl,
          IAM_GATEWAY_APISIX_ADMIN_URL: "http://apisix:9180/apisix/admin",
          IAM_GATEWAY_APISIX_ADMIN_KEY: apisixAdminKey,
          IAM_GATEWAY_HOSTNAME: "0.0.0.0",
        },
      },
      admin: {
        image: e2eLocalImageTag("admin"),
        build: withCache(
          "admin",
          { ...appImage("admin"), args: frontendBuildArgs("admin", adminClientCode) },
          cacheMode,
        ),
        labels,
        healthcheck: healthcheck("wget", "--quiet", "--spider", "http://127.0.0.1/iam-admin/"),
      },
      sso: {
        image: e2eLocalImageTag("sso"),
        build: withCache("sso", { ...appImage("sso"), args: frontendBuildArgs("sso", adminClientCode) }, cacheMode),
        labels,
        healthcheck: healthcheck("wget", "--quiet", "--spider", "http://127.0.0.1/portal/login"),
      },
    },
  };
}

function appImage(app: string) {
  return { context: ".", dockerfile: `apps/${app}/Dockerfile` };
}

function withCache<T extends Record<string, unknown>>(service: string, build: T, cacheMode: E2EBuildxCacheMode) {
  if (cacheMode !== "gha") return build;
  return {
    ...build,
    cache_from: [`type=gha,scope=e2e-${service}`],
    cache_to: [`type=gha,mode=max,scope=e2e-${service}`],
  };
}

function httpHealth(port: number, path: string, status = 200) {
  return healthcheck(
    "bun",
    "-e",
    `if ((await fetch("http://127.0.0.1:${port}${path}")).status !== ${status}) process.exit(1)`,
  );
}

function healthcheck(...args: string[]) {
  return { test: ["CMD", ...args], interval: "1s", timeout: "3s", retries: 60 };
}
