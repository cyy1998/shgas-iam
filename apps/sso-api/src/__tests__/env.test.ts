import { expect, test } from "bun:test";
import { parseSsoApiEnv } from "../env";

const minimum = {
  IAM_SSO_API_DATABASE_URL: "postgres://fixture@localhost/iam",
  IAM_SSO_API_REDIS_URL: "redis://localhost:6379/1",
  IAM_SSO_API_SSO_INTERNAL_ORIGIN: "https://iam.internal/",
  IAM_SSO_API_SSO_EXTERNAL_ORIGIN: "https://iam.example",
  IAM_SSO_API_OIDC_CURRENT_JWK_JSON: "validated by the signing-key owner at startup",
};

test("SSO API defaults to its own port, protocol namespaces and disabled QR", () => {
  const env = parseSsoApiEnv({ ...minimum, NODE_ENV: "production", IAM_API_WECHAT_QR_ENABLED: "true" });
  expect(env).toMatchObject({
    port: 30002,
    wechatQrEnabled: false,
    oidc: { cookieSecure: true, namespace: "iam:oidc" },
    sessionKernel: { namespace: "iam:session" },
    sso: { internalOrigin: "https://iam.internal", externalOrigin: "https://iam.example" },
  });
  expect(parseSsoApiEnv({ ...minimum, IAM_SSO_API_WECHAT_QR_ENABLED: "true" }).wechatQrEnabled).toBe(true);
});

test.each([
  { IAM_SSO_API_SSO_INTERNAL_ORIGIN: "https://iam.internal/oidc" },
  { IAM_SSO_API_OIDC_CURRENT_JWK_JSON: undefined },
  { IAM_SSO_API_LOGIN_ENDPOINT: "//example.com" },
])("SSO API rejects invalid required protocol configuration %j", (override) => {
  expect(() => parseSsoApiEnv({ ...minimum, ...override })).toThrow();
});
