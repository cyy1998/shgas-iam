import { describe, expect, test } from "bun:test";
import {
  createE2ECompose,
  e2eBuildServices,
  e2eLocalImageTag,
  e2eStubsCaMountPath,
  resolveBuildxCacheMode,
} from "../e2e-compose.ts";

const baseOptions = {
  project: "iam-e2e-compose-test",
  origin: "http://external.iam.localhost:41080",
  internalOrigin: "http://internal.iam.localhost:41080",
  wecomMobileOrigin: "https://external.iam.localhost:41443",
  httpPort: 41080,
  httpsPort: 41443,
  seedRunId: "20261127-seed-run",
  stubsToken: "synthetic-stubs-token",
  stubsCaPem: "-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----\n",
  env: {} as NodeJS.ProcessEnv,
};

describe("production container E2E compose topology", () => {
  test("wires all 13 services, zero-intrusion WeCom CA/alias, SMS stub URL, and local image tags", () => {
    const compose = createE2ECompose(baseOptions);

    expect(Object.keys(compose.services)).toEqual([
      "postgres",
      "redis",
      "apisix-etcd",
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
    ]);

    expect(compose.configs).toEqual({
      "e2e-stubs-ca": { content: baseOptions.stubsCaPem },
    });

    expect(compose.services.apisix.ports).toEqual(["127.0.0.1:41080:9080", "127.0.0.1:41443:9443", "127.0.0.1:0:9180"]);
    expect("network_mode" in compose.services.apisix).toBe(false);

    expect(compose.services["e2e-stubs"]).toMatchObject({
      image: e2eLocalImageTag("e2e-stubs"),
      build: { context: "e2e/system", dockerfile: "docker/e2e-stubs/Dockerfile" },
      ports: ["127.0.0.1:0:8080"],
      networks: { default: { aliases: ["qyapi.weixin.qq.com"] } },
      environment: {
        IAM_E2E_WECOM_RUN_ID: baseOptions.seedRunId,
        IAM_E2E_STUBS_TOKEN: baseOptions.stubsToken,
      },
    });

    expect(compose.services["auth-api"]).toMatchObject({
      image: e2eLocalImageTag("auth-api"),
      build: { context: ".", dockerfile: "apps/auth-api/Dockerfile" },
      configs: [{ source: "e2e-stubs-ca", target: e2eStubsCaMountPath }],
      environment: {
        NODE_EXTRA_CA_CERTS: e2eStubsCaMountPath,
        IAM_AUTH_API_SMS_URL: "http://e2e-stubs:8080/test-sms",
        IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: "https://external.iam.localhost:41443/sso/wechat-qr/mobile/callback",
        IAM_AUTH_API_SSO_INTERNAL_ORIGIN: baseOptions.internalOrigin,
        IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: baseOptions.origin,
      },
    });

    expect(compose.services["sso-api"].environment).toMatchObject({
      IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
      IAM_SSO_API_WECHAT_QR_ENABLED: "true",
    });

    expect(compose.services["integration-api"].environment).toMatchObject({
      IAM_INTEGRATION_API_SMS_URL: "http://sms.example.invalid/test-sms",
      IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: "e2e-sms",
    });

    expect(compose.services.worker.environment).toMatchObject({
      IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
    });

    expect(compose.services.admin.build.args).toMatchObject({
      IAM_ADMIN_WEB_CLIENT_CODE: "iam-admin",
      IAM_ADMIN_WEB_API_PREFIX: "/api/iam",
    });
    expect(compose.services.sso.build.args).toMatchObject({
      IAM_SSO_WEB_CLIENT_CODE: "iam",
      IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary",
    });

    for (const service of e2eBuildServices) {
      expect(compose.services[service].image).toBe(e2eLocalImageTag(service));
      expect("cache_from" in compose.services[service].build).toBe(false);
    }
  });

  test("configures BuildKit GHA cache when enabled via env or GitHub Actions runtime", () => {
    expect(resolveBuildxCacheMode({})).toBe("none");
    expect(resolveBuildxCacheMode({ CI: "true" })).toBe("none");
    expect(resolveBuildxCacheMode({ CI: "true", ACTIONS_CACHE_URL: "https://cache.example" })).toBe("gha");
    expect(resolveBuildxCacheMode({ CI: "true", ACTIONS_RESULTS_URL: "https://results.example" })).toBe("gha");
    expect(
      resolveBuildxCacheMode({ CI: "true", ACTIONS_CACHE_URL: "https://cache.example", IAM_E2E_BUILDX_CACHE: "off" }),
    ).toBe("none");
    expect(resolveBuildxCacheMode({ IAM_E2E_BUILDX_CACHE: "gha" })).toBe("gha");
    expect(() => resolveBuildxCacheMode({ IAM_E2E_BUILDX_CACHE: "registry" })).toThrow(/IAM_E2E_BUILDX_CACHE/u);

    const ciCompose = createE2ECompose({ ...baseOptions, env: { IAM_E2E_BUILDX_CACHE: "gha" } });
    expect(ciCompose.services["auth-api"].build).toMatchObject({
      cache_from: ["type=gha,scope=e2e-auth-api"],
      cache_to: ["type=gha,mode=max,scope=e2e-auth-api"],
    });
    expect(ciCompose.services["e2e-stubs"].build).toMatchObject({
      cache_from: ["type=gha,scope=e2e-e2e-stubs"],
      cache_to: ["type=gha,mode=max,scope=e2e-e2e-stubs"],
    });
  });
});
