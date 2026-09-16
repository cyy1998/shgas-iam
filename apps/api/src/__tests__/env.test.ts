import { beforeAll, describe, expect, test } from "bun:test";

type ParseApiEnv = typeof import("../env").parseApiEnv;

let parseApiEnv: ParseApiEnv;

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_API_OIDC_CURRENT_JWK_JSON: "runtime-validates-signing-material",
    IAM_API_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_API_REDIS_HOST: "localhost",
    IAM_API_REDIS_PORT: "6379",
    IAM_API_REDIS_DB: "0",
    IAM_API_SMS_SIGNATURE_KEY: "sms-signature",
    IAM_API_SMS_URL: "https://sms.example.com/send",
    IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "86400",
    IAM_API_AUTH_CODE_TTL_SECONDS: "300",
    IAM_API_ORCAS_URL: "https://orcas.example.com/login",
    IAM_API_WECHAT_CORP_ID: "corp-id",
    IAM_API_WECHAT_CORP_SECRET: "corp-secret",
    IAM_API_MAGIC_CODE: "1234",
    IAM_API_LOGIN_ENDPOINT: "/portal/login",
    IAM_API_SSO_INTERNAL_ORIGIN: "https://iam.internal.example.com",
    IAM_API_SSO_EXTERNAL_ORIGIN: "https://iam.example.com",
    IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
    IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
    IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
    IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "2026-05-primary",
    IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
      "2026-05-primary": "private-key",
    }),
  };
}

describe("API environment", () => {
  beforeAll(async () => {
    Object.assign(process.env, validEnv());
    ({ parseApiEnv } = await import("../env"));
  });

  test("exports grouped runtime config from IAM_API raw env", () => {
    const env = parseApiEnv(validEnv());

    expect(env.databaseUrl).toBe("postgresql://iam:password@localhost/iam");
    expect(env.redis.host).toBe("localhost");
    expect(env.log.format).toBe("auto");
    expect(env.sso.externalOrigin).toBe("https://iam.example.com");
    expect(env.sso.projectionRetryAfterSeconds).toBe(3);
    expect(env.loginCredential.privateKeysByKid["2026-05-primary"]).toBe("private-key");
    expect(env.userProfile).toEqual({
      dslMaxLimit: 100,
    });
    expect("IAM_API_USER_PROFILE_DSL_MAX_LIMIT" in env).toBe(false);
  });

  test("accepts app-prefixed user-profile DSL override", () => {
    const env = parseApiEnv({
      ...validEnv(),
      IAM_API_USER_PROFILE_DSL_MAX_LIMIT: "75",
    });

    expect(env.userProfile).toEqual({
      dslMaxLimit: 75,
    });
  });

  test("rejects unsafe user-profile DSL limits", () => {
    expect(() => parseApiEnv({
      ...validEnv(),
      IAM_API_USER_PROFILE_DSL_MAX_LIMIT: "501",
    })).toThrow();
  });

  test("accepts only positive Custom SSO projection retry hints", () => {
    expect(parseApiEnv({
      ...validEnv(),
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
    }).sso.projectionRetryAfterSeconds).toBe(7);
    expect(() => parseApiEnv({
      ...validEnv(),
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "0",
    })).toThrow();
  });

  test("accepts production configuration without lookup secrets", () => {
    const env = parseApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    });

    expect(env.nodeEnv).toBe("production");
    expect(env.sessionKernel.namespace).toBe("iam:session");
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
  ])("rejects invalid SSO origin %s before enabling either OIDC entry", (origin) => {
    for (const key of ["IAM_API_SSO_INTERNAL_ORIGIN", "IAM_API_SSO_EXTERNAL_ORIGIN"])
      expect(() => parseApiEnv({ ...validEnv(), [key]: origin })).toThrow();
  });

  test("normalizes both configured origins and allows a single canonical origin", () => {
    const env = parseApiEnv({ ...validEnv(), IAM_API_SSO_INTERNAL_ORIGIN: "https://IAM.EXAMPLE.COM:443/" });
    expect(env.sso.internalOrigin).toBe("https://iam.example.com");
    expect(env.sso.internalOrigin).toBe(env.sso.externalOrigin);
  });

  test("validates OIDC signing configuration and protocol lifetimes", () => {
    for (const override of [
      { IAM_API_OIDC_CURRENT_JWK_JSON: "" },
      { IAM_API_OIDC_TOKEN_TTL_SECONDS: "0" },
      { IAM_API_SESSION_KERNEL_NAMESPACE: "unsafe namespace" },
    ]) {
      expect(() => parseApiEnv({ ...validEnv(), ...override })).toThrow();
    }
  });

  test("maps OIDC rotation and lifetime configuration with production Secure default", () => {
    const env = parseApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_API_OIDC_PREVIOUS_JWK_JSON: "previous-private-jwk",
      IAM_API_OIDC_CONTINUATION_TTL_SECONDS: "120",
    });
    expect(env.oidc).toMatchObject({
      previousJwkJson: "previous-private-jwk",
      namespace: "iam:oidc",
      continuationTtlSeconds: 120,
      cookieSecure: true,
    });
    expect(parseApiEnv({ ...validEnv(), IAM_API_OIDC_COOKIE_SECURE: "false" }).oidc.cookieSecure).toBe(false);
    expect(env.sessionKernel).toEqual({ namespace: "iam:session", userSessionTtlSeconds: 86400, clientSessionTtlSeconds: 86400 });
  });

  test("configures each session lifetime independently from protocol tokens and preserves the login endpoint", () => {
    const env = parseApiEnv({
      ...validEnv(),
      IAM_API_USER_SESSION_TTL_SECONDS: "86400",
      IAM_API_CLIENT_SESSION_TTL_SECONDS: "3600",
      IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "900",
      IAM_API_OIDC_TOKEN_TTL_SECONDS: "600",
      IAM_API_LOGIN_ENDPOINT: "/custom-entry",
    });
    expect(env.sessionKernel).toMatchObject({ userSessionTtlSeconds: 86400, clientSessionTtlSeconds: 3600 });
    expect(env.auth.customSsoTokenTtlSeconds).toBe(900);
    expect(env.oidc.tokenTtlSeconds).toBe(600);
    expect(env.oidc.trustProxy).toBe(true);
    expect(parseApiEnv({ ...validEnv(), IAM_API_OIDC_TRUST_PROXY: "false" }).oidc.trustProxy).toBe(false);
    expect(env.sso.loginEndpoint).toBe("/custom-entry");
    for (const key of ["IAM_API_USER_SESSION_TTL_SECONDS", "IAM_API_CLIENT_SESSION_TTL_SECONDS"])
      expect(() => parseApiEnv({ ...validEnv(), [key]: "0" })).toThrow();
  });

  test.each([
    "https://login.example.com/portal/login",
    "//evil.example/login",
    "///evil.example/login",
    "/\\evil.example/login",
    "/portal\\login",
    " /portal/login",
    "/\t/evil.example",
    "/%2f/evil.example",
    "/%5cevil.example",
    "/../ /login",
    "/..//evil.example",
    "/%2e%2e//evil.example",
  ])("rejects unsafe login navigation configuration %s", (endpoint) => {
    expect(() => parseApiEnv({ ...validEnv(), IAM_API_LOGIN_ENDPOINT: endpoint })).toThrow("safe root-relative path");
  });

  test("still requires a configured active login credential key in production", () => {
    expect(() => parseApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "missing",
    })).toThrow("IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID must exist");
  });
});
