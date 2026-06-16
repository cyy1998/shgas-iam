import type { OidcProviderEnv } from "../env.ts";
import { createLogger as createIamLogger, LoggerSourceApp } from "@iam/api-core/logger";

export const OIDC_EXTRA_LOG_REDACT_PATHS = [
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

export function createLogger(env: Pick<OidcProviderEnv, "LOG_LEVEL" | "LOG_FORMAT" | "NODE_ENV">) {
  return createIamLogger({
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    logFormat: env.LOG_FORMAT,
    sourceApp: LoggerSourceApp.OidcProvider,
    extraRedactPaths: OIDC_EXTRA_LOG_REDACT_PATHS,
  });
}

export type OidcLogger = ReturnType<typeof createLogger>;
