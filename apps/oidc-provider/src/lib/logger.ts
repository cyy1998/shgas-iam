import type { OidcProviderEnv } from "../env.ts";
import { IAM_LOG_REDACT_PATHS } from "@iam/api-core/logger";
import pino from "pino";

export const OIDC_LOG_REDACT_PATHS = [
  ...IAM_LOG_REDACT_PATHS,
  "*.secret",
  "*.secretHash",
  "*.oidcSecretHash",
  "*.code",
  "*.authorizationCode",
  "*.token",
  "*.accessToken",
  "*.idToken",
  "*.refreshToken",
  "*.clientSecret",
  "*.codeVerifier",
  "*.cookie",
  "*.privateKey",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
];

export function createLogger(env: Pick<OidcProviderEnv, "LOG_LEVEL">) {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: OIDC_LOG_REDACT_PATHS,
      censor: "[REDACTED]",
    },
  }).child({ sourceApp: "iam-oidc-provider" });
}

export type OidcLogger = ReturnType<typeof createLogger>;
