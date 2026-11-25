import { generateKeyPairSync } from "node:crypto";
import { frontendEnvironment } from "../src/frontend/frontend-config.ts";
import { apisixAdminKey, createHybridCompose, e2eDatabaseName, e2eDatabasePassword } from "../src/hybrid-compose.ts";
import { e2eLoginCredentialEnvironment } from "../src/login-credential-config.ts";

export const containerSmokeImages = [
  "apisix",
  "auth-api",
  "sso-api",
  "integration-api",
  "admin-api",
  "worker",
  "gateway-api",
  "admin",
  "sso",
];
export const containerSmokeInfrastructure = ["postgres", "redis", "apisix-etcd", "apisix"];
export const containerSmokeApplications = containerSmokeImages.slice(1);
export const smokeGatewayApiPort = 30004;

const databaseUrl = `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@postgres:5432/${e2eDatabaseName}`;
const redisUrl = "redis://redis:6379/0";

export function createContainerSmokeCompose(options: {
  repositoryRoot: string;
  project: string;
  origin: string;
  internalOrigin: string;
  gatewayPort: number;
  adminClientCode: string;
}) {
  const { project, repositoryRoot, origin, internalOrigin, gatewayPort, adminClientCode } = options;
  const frontend = { repoRoot: repositoryRoot, adminClientCode };
  const infrastructure = createHybridCompose({
    network: "bridge",
    project,
    ports: { postgres: 0, redis: 0, etcd: 0, http: gatewayPort, https: 0, admin: 0 },
  });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "e2e-container-smoke-rs256", alg: "RS256", use: "sig" };
  return {
    ...infrastructure,
    services: {
      ...infrastructure.services,
      apisix: {
        ...infrastructure.services.apisix,
        ports: [`127.0.0.1:${gatewayPort}:9080`, "127.0.0.1:0:9180"],
      },
      "auth-api": {
        build: image("auth-api"),
        healthcheck: httpHealth(30000, "/ready"),
        environment: {
          IAM_AUTH_API_DATABASE_URL: databaseUrl,
          IAM_AUTH_API_REDIS_URL: redisUrl,
          IAM_AUTH_API_SMS_URL: "http://127.0.0.1:9/test-sms",
          IAM_AUTH_API_SMS_SIGNATURE_KEY: "e2e-sms",
          IAM_AUTH_API_WECHAT_CORP_ID: "ww-e2e-local",
          IAM_AUTH_API_WECHAT_CORP_SECRET: "wecom-e2e-secret-only",
          IAM_AUTH_API_MAGIC_CODE: "1234",
          IAM_AUTH_API_CAP_ENABLED: "false",
          ...e2eLoginCredentialEnvironment,
          IAM_AUTH_API_SSO_INTERNAL_ORIGIN: internalOrigin,
          IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: origin,
        },
      },
      "sso-api": {
        build: image("sso-api"),
        healthcheck: httpHealth(30002, "/ready"),
        environment: {
          IAM_SSO_API_DATABASE_URL: databaseUrl,
          IAM_SSO_API_REDIS_URL: redisUrl,
          IAM_SSO_API_OIDC_CURRENT_JWK_JSON: JSON.stringify(jwk),
          IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
          IAM_SSO_API_SSO_INTERNAL_ORIGIN: internalOrigin,
          IAM_SSO_API_SSO_EXTERNAL_ORIGIN: origin,
        },
      },
      "integration-api": {
        build: image("integration-api"),
        healthcheck: httpHealth(30005, "/ready"),
        environment: {
          IAM_INTEGRATION_API_DATABASE_URL: databaseUrl,
          IAM_INTEGRATION_API_REDIS_URL: redisUrl,
          IAM_INTEGRATION_API_SMS_URL: "http://sms.example.invalid/test-sms",
          IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: "e2e-sms",
        },
      },
      "admin-api": {
        build: image("admin-api"),
        healthcheck: httpHealth(30001, "/admin/users/search", 403),
        environment: {
          IAM_ADMIN_API_DATABASE_URL: databaseUrl,
          IAM_ADMIN_API_REDIS_URL: redisUrl,
          IAM_ADMIN_API_HOSTNAME: "0.0.0.0",
          IAM_ADMIN_API_ADMIN_CLIENT_CODES: adminClientCode,
        },
      },
      worker: {
        build: image("worker"),
        healthcheck: httpHealth(30003, "/healthz"),
        environment: {
          IAM_WORKER_DATABASE_URL: databaseUrl,
          IAM_WORKER_REDIS_URL: redisUrl,
          IAM_WORKER_ENABLED_MODULES: "user-document",
        },
      },
      "gateway-api": {
        build: image("gateway"),
        healthcheck: httpHealth(smokeGatewayApiPort, "/health"),
        ports: [`127.0.0.1:0:${smokeGatewayApiPort}`],
        environment: {
          IAM_GATEWAY_DATABASE_URL: databaseUrl,
          IAM_GATEWAY_APISIX_ADMIN_URL: "http://apisix:9180/apisix/admin",
          IAM_GATEWAY_APISIX_ADMIN_KEY: apisixAdminKey,
          IAM_GATEWAY_HOSTNAME: "0.0.0.0",
        },
      },
      admin: {
        build: { ...image("admin"), args: frontendEnvironment("admin", frontend) },
        healthcheck: healthcheck("wget", "--quiet", "--spider", "http://127.0.0.1/iam-admin/"),
      },
      sso: {
        build: { ...image("sso"), args: frontendEnvironment("sso", frontend) },
        healthcheck: healthcheck("wget", "--quiet", "--spider", "http://127.0.0.1/portal/login"),
      },
    },
  };
}

function image(app: string) {
  // With the project directory set to the repository root, these are also portable recovery paths.
  return { context: ".", dockerfile: `apps/${app}/Dockerfile` };
}

function httpHealth(port: number, path: string, status = 200) {
  return healthcheck(
    "bun",
    "-e",
    `if ((await fetch("http://127.0.0.1:${port}${path}")).status !== ${status}) process.exit(1)`,
  );
}

function healthcheck(...args: string[]) {
  return { test: ["CMD", ...args], interval: "2s", timeout: "3s", retries: 45 };
}
