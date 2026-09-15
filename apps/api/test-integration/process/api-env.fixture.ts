import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import { generateKeyPairSync } from "node:crypto";
import { createProcessSmokeEnvironment } from "@iam/api-core/testing/process-smoke-harness";

const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
const previousKey = JSON.stringify({ ...generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" }), kid: "api-previous", alg: "RS256", use: "sig" });
const signingKey = JSON.stringify({ ...generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" }), kid: "api-process", alg: "RS256", use: "sig" });
export function createEntryEnvironment(context: ProcessSmokeAttemptContext, overrides: NodeJS.ProcessEnv = {}) {
  const origin = `http://${context.hostname}:${context.port}`;
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_API_OIDC_ISSUER: `${origin}/oidc`,
      IAM_API_OIDC_PUBLIC_ORIGIN: origin,
      IAM_API_OIDC_CURRENT_JWK_JSON: signingKey,
      IAM_API_OIDC_PREVIOUS_JWK_JSON: previousKey,
      IAM_API_OIDC_COOKIE_SECURE: "false",
      IAM_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-smoke-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
      IAM_API_ORCAS_URL: "http://127.0.0.1:1/orcas",
      IAM_API_PORT: String(context.port),
      IAM_API_WECHAT_CORP_ID: "unreachable-smoke-corp",
      IAM_API_WECHAT_CORP_SECRET: "unreachable-smoke-secret",
      IAM_API_MAGIC_CODE: "000000",
      IAM_API_REDIS_HOST: "127.0.0.1",
      IAM_API_REDIS_PORT: "1",
      IAM_API_REDIS_DB: "15",
      IAM_API_LOGIN_ENDPOINT: "/login",
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
      IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
      IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
      IAM_API_LOG_LEVEL: "info",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-smoke",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-smoke": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: `sess:api-entry-smoke:${context.port}:`,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      ...overrides,
    },
  });
}
