import { describe, expect, test } from "bun:test";
import { parseAuthApiEnv } from "../env";

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_AUTH_API_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_AUTH_API_REDIS_URL: "redis://localhost:6379/0",
    IAM_AUTH_API_SMS_SIGNATURE_KEY: "sms-signature",
    IAM_AUTH_API_SMS_URL: "https://sms.example.com/send",
    IAM_AUTH_API_WECHAT_CORP_ID: "corp-id",
    IAM_AUTH_API_WECHAT_CORP_SECRET: "corp-secret",
    IAM_AUTH_API_MAGIC_CODE: "1234",
    IAM_AUTH_API_SSO_INTERNAL_ORIGIN: "https://iam.internal.example.com",
    IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: "https://iam.example.com",
    IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: "2026-05-primary",
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
      "2026-05-primary": "private-key",
    }),
  };
}

describe("Auth API environment", () => {
  test("exports grouped runtime config from IAM_API raw env", () => {
    const env = parseAuthApiEnv(validEnv());

    expect(env.databaseUrl).toBe("postgresql://iam:password@localhost/iam");
    expect(env.redis.host).toBe("localhost");
    expect(env.log.format).toBe("auto");
    expect(env.sso.externalOrigin).toBe("https://iam.example.com");
    expect(env.sso.projectionRetryAfterSeconds).toBe(3);
    expect(env.loginCredential.privateKeysByKid["2026-05-primary"]).toBe("private-key");
  });

  test("accepts only positive Custom SSO projection retry hints", () => {
    expect(
      parseAuthApiEnv({
        ...validEnv(),
        IAM_AUTH_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
      }).sso.projectionRetryAfterSeconds,
    ).toBe(7);
    expect(() =>
      parseAuthApiEnv({
        ...validEnv(),
        IAM_AUTH_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "0",
      }),
    ).toThrow();
  });

  test("maps a Redis URL to its complete connection configuration", () => {
    const env = parseAuthApiEnv({
      ...validEnv(),
      IAM_AUTH_API_REDIS_URL: "redis://api-user:p%40ss%3Aword@cache.local:6380/3",
    });
    expect(env.redis).toEqual({ host: "cache.local", port: 6380, db: 3, username: "api-user", password: "p@ss:word" });
  });

  test("requires a Redis URL instead of separate connection fields", () => {
    expect(() =>
      parseAuthApiEnv({
        ...validEnv(),
        IAM_AUTH_API_REDIS_URL: undefined,
        IAM_AUTH_API_REDIS_HOST: "localhost",
        IAM_AUTH_API_REDIS_PORT: "6379",
        IAM_AUTH_API_REDIS_DB: "0",
      }),
    ).toThrow("IAM_AUTH_API_REDIS_URL");
  });

  test("accepts production configuration with the default port and shared namespaces", () => {
    const env = parseAuthApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    });

    expect(env.nodeEnv).toBe("production");
    expect(env.port).toBe(30000);
    expect(env.sessionKernel.namespace).toBe("iam:session");
    expect(env.oidc).toEqual({ namespace: "iam:oidc" });
  });

  test.each([
    "ftp://iam.example.com",
    "https://user:password@iam.example.com",
    "https://iam.example.com/path",
    "https://iam.example.com?entry=internal",
    "https://iam.example.com#fragment",
    " https://iam.example.com",
    "https://iam.example.com/\\path",
    "not-an-origin",
    "",
  ])("rejects invalid SSO origin %s at either entry", (origin) => {
    for (const key of ["IAM_AUTH_API_SSO_INTERNAL_ORIGIN", "IAM_AUTH_API_SSO_EXTERNAL_ORIGIN"])
      expect(() => parseAuthApiEnv({ ...validEnv(), [key]: origin })).toThrow();
  });

  test("normalizes both configured origins and allows a single canonical origin", () => {
    const env = parseAuthApiEnv({ ...validEnv(), IAM_AUTH_API_SSO_INTERNAL_ORIGIN: "https://IAM.EXAMPLE.COM:443/" });
    expect(env.sso.internalOrigin).toBe("https://iam.example.com");
    expect(env.sso.internalOrigin).toBe(env.sso.externalOrigin);
  });

  test("enables WeChat QR only with paired AgentId and the exact HTTPS callback on the public hostname", () => {
    const disabled = parseAuthApiEnv({
      ...validEnv(),
      IAM_AUTH_API_WECHAT_QR_AGENT_ID: "",
      IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: "",
    });
    expect(disabled.integrations.wechat.qr).toBeUndefined();

    const callbackUrl = "https://iam.example.com:8443/sso/wechat-qr/mobile/callback";
    const enabled = parseAuthApiEnv({
      ...validEnv(),
      IAM_AUTH_API_WECHAT_QR_AGENT_ID: "1000001",
      IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: callbackUrl,
    });
    expect(enabled.integrations.wechat.qr).toEqual({ agentId: "1000001", callbackUrl });

    const invalid = [
      undefined,
      "http://iam.example.com/sso/wechat-qr/mobile/callback",
      "https://another.example.com/sso/wechat-qr/mobile/callback",
      "https://iam.example.com/sso/wechat-qr/mobile/callback?source=1",
      "https://iam.example.com/other-path",
    ];
    for (const callback of invalid) {
      expect(() =>
        parseAuthApiEnv({
          ...validEnv(),
          IAM_AUTH_API_WECHAT_QR_AGENT_ID: "1000001",
          IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: callback,
        }),
      ).toThrow("WeChat QR requires the canonical HTTPS public");
    }
  });

  test("still requires a configured active login credential key in production", () => {
    expect(() =>
      parseAuthApiEnv({
        ...validEnv(),
        NODE_ENV: "production",
        IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: "missing",
      }),
    ).toThrow("IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID must exist");
  });
});
