import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

type Compose = {
  services: Record<
    string,
    {
      image?: string;
      build?: Record<string, unknown>;
      labels?: Record<string, string>;
    }
  >;
};

const compose = Bun.YAML.parse(
  readFileSync(new URL("../../docker-compose.e2e.yml", import.meta.url), "utf8"),
) as Compose;
const cache = Bun.YAML.parse(
  readFileSync(new URL("../../docker-compose.e2e.gha-cache.yml", import.meta.url), "utf8"),
) as Compose;
const buildServices = [
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
];

test("defines the isolated production-container E2E topology and WeCom stub trust", () => {
  expect(Object.keys(compose.services)).toEqual(["postgres", "redis", "apisix-etcd", ...buildServices]);
  for (const service of Object.values(compose.services)) {
    expect(service.labels).toEqual({
      "com.shgas-iam.e2e.managed": "true",
      "com.shgas-iam.e2e.project": `\${E2E_PROJECT}`,
    });
  }
  expect(compose).toMatchObject({
    configs: { "e2e-stubs-ca": { file: "e2e/system/test-assets/e2e-stubs-ca.pem" } },
    services: {
      postgres: {
        image: `\${IAM_E2E_POSTGRES_IMAGE:-docker.xuanyuan.run/postgres:18.4}`,
        tmpfs: ["/var/lib/postgresql:size=1g"],
        command: expect.arrayContaining(["fsync=off", "synchronous_commit=off", "full_page_writes=off"]),
      },
      redis: {
        image: `\${IAM_E2E_REDIS_IMAGE:-docker.xuanyuan.run/library/redis:8.8.0}`,
        command: ["redis-server", "--save", "", "--appendonly", "no"],
      },
      "apisix-etcd": { image: `\${IAM_E2E_ETCD_IMAGE:-docker.xuanyuan.run/bitnamilegacy/etcd:3.5.11}` },
      apisix: {
        build: {
          context: "e2e/system/docker/apisix",
          args: { APISIX_IMAGE: `\${IAM_E2E_APISIX_BASE_IMAGE:-docker.xuanyuan.run/apache/apisix:3.16.0-debian}` },
        },
        ports: [`127.0.0.1:\${E2E_HTTP_PORT:-0}:9080`, `127.0.0.1:\${E2E_HTTPS_PORT:-0}:9443`, "127.0.0.1:0:9180"],
      },
      "e2e-stubs": {
        build: {
          context: "e2e/system",
          dockerfile: "docker/e2e-stubs/Dockerfile",
          args: { BUN_IMAGE: `\${IAM_E2E_BUN_IMAGE:-docker.xuanyuan.run/oven/bun:1.4.4-alpine}` },
        },
        ports: ["127.0.0.1:0:8080"],
        networks: { default: { aliases: ["qyapi.weixin.qq.com"] } },
        environment: { IAM_E2E_WECOM_RUN_ID: `\${E2E_RUN_ID:-}`, IAM_E2E_STUBS_TOKEN: `\${E2E_STUBS_TOKEN:-}` },
      },
      "auth-api": {
        build: { context: ".", dockerfile: "apps/auth-api/Dockerfile" },
        configs: [{ source: "e2e-stubs-ca", target: "/etc/e2e-ca/ca.pem" }],
        environment: {
          NODE_EXTRA_CA_CERTS: "/etc/e2e-ca/ca.pem",
          IAM_AUTH_API_SMS_URL: "http://e2e-stubs:8080/test-sms",
          IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: `\${E2E_WECOM_MOBILE_ORIGIN:-}/sso/wechat-qr/mobile/callback`,
          IAM_AUTH_API_SSO_INTERNAL_ORIGIN: `\${E2E_INTERNAL_ORIGIN:-}`,
          IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: `\${E2E_ORIGIN:-}`,
        },
      },
      "sso-api": {
        environment: {
          IAM_SSO_API_OIDC_CURRENT_JWK_JSON: `\${E2E_OIDC_JWK_JSON:-}`,
          IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
          IAM_SSO_API_WECHAT_QR_ENABLED: "true",
        },
      },
      worker: {
        environment: {
          IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
          IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
        },
      },
      admin: { build: { args: { IAM_ADMIN_WEB_CLIENT_CODE: `\${E2E_ADMIN_CLIENT_CODE:-iam-admin}` } } },
      sso: { build: { args: { IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary" } } },
    },
  });
  const apisix = Bun.YAML.parse(readFileSync(new URL("../../docker/apisix/apisix.yaml", import.meta.url), "utf8"));
  expect(apisix).toMatchObject({
    apisix: { dns_resolver_valid: 1 },
    nginx_config: { error_log: "/dev/stderr" },
  });
});

test("isolates GHA caching to an override for the ten images built per project", () => {
  expect(Object.keys(cache.services).sort()).toEqual([...buildServices].sort());
  for (const service of buildServices) {
    expect(compose.services[service]?.image).toBe(`iam-e2e-${service}:\${E2E_IMAGE_TAG:-local}`);
    expect(compose.services[service]?.build).toBeDefined();
    expect(compose.services[service]?.build).not.toHaveProperty("cache_from");
    expect(compose.services[service]?.build).not.toHaveProperty("cache_to");
    expect(cache.services[service]).toEqual({
      build: {
        cache_from: [`type=gha,scope=e2e-${service}`],
        cache_to: [`type=gha,mode=max,scope=e2e-${service}`],
      },
    });
  }
});
