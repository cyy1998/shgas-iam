import { DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET } from "@iam/api-core/session/kernel";
import { beforeAll, describe, expect, test } from "bun:test";

type ParseApiEnv = typeof import("../env").parseApiEnv;

let parseApiEnv: ParseApiEnv;

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_API_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_API_REDIS_HOST: "localhost",
    IAM_API_REDIS_PORT: "6379",
    IAM_API_REDIS_DB: "0",
    IAM_API_SMS_SIGNATURE_KEY: "sms-signature",
    IAM_API_SMS_URL: "https://sms.example.com/send",
    IAM_API_SESSION_DEFAULT_TTL_SECONDS: "86400",
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
    expect(env.loginCredential.privateKeysByKid["2026-05-primary"]).toBe("private-key");
  });

  test("rejects the default Session Kernel HMAC secret in production", () => {
    expect(() => parseApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    })).toThrow("IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");

    expect(() => parseApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
    })).toThrow("IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");
  });
});
