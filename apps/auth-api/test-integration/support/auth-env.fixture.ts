import { type Env, parseAuthApiEnv } from "@auth-api/env";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";

export const internalOrigin = "https://internal.example";
export const externalOrigin = "https://external.example";
export const qrCallback = `${externalOrigin}/sso/wechat-qr/mobile/callback`;

export function authTestEnv(databaseUrl: string, overrides: NodeJS.ProcessEnv = {}): Env {
  return parseAuthApiEnv({
    NODE_ENV: "test",
    IAM_AUTH_API_DATABASE_URL: databaseUrl,
    IAM_AUTH_API_REDIS_URL: requireExternalTestUrl({
      environment: process.env,
      lane: "Auth API Integration",
      name: "IAM_TEST_REDIS_URL",
    }),
    IAM_AUTH_API_SMS_URL: "https://sms.example.test/send",
    IAM_AUTH_API_SMS_SIGNATURE_KEY: "fixture",
    IAM_AUTH_API_WECHAT_CORP_ID: "fixture",
    IAM_AUTH_API_WECHAT_CORP_SECRET: "fixture",
    IAM_AUTH_API_MAGIC_CODE: "000000",
    IAM_AUTH_API_PASSWORD_HASH_ROUNDS: "4",
    IAM_AUTH_API_SSO_INTERNAL_ORIGIN: internalOrigin,
    IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: externalOrigin,
    IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: "fixture",
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ fixture: "1".repeat(64) }),
    ...overrides,
  });
}
