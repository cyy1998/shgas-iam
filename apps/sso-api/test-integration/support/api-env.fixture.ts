import type { ProcessSmokeAttemptContext } from "@iam/test-support/process-smoke-harness";
import { createProcessSmokeEnvironment } from "@iam/test-support/process-smoke-harness";
import { signingKeys } from "../../src/testing/oidc-signing.fixture";

const current = signingKeys("sso-process");
const previous = signingKeys("sso-previous");

export function createEntryEnvironment(context: ProcessSmokeAttemptContext, overrides: NodeJS.ProcessEnv = {}) {
  const origin = `http://${context.hostname}:${context.port}`;
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_SSO_API_OIDC_CURRENT_JWK_JSON: current,
      IAM_SSO_API_OIDC_PREVIOUS_JWK_JSON: previous,
      IAM_SSO_API_OIDC_COOKIE_SECURE: "false",
      IAM_SSO_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_SSO_API_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_SSO_API_PORT: String(context.port),
      IAM_SSO_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_SSO_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_SSO_API_LOG_FORMAT: "json",
      ...overrides,
    },
  });
}
