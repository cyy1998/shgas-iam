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

export function createLogger(env: Pick<OidcProviderEnv, "log" | "nodeEnv">) {
  return createIamLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.OidcProvider,
    extraRedactPaths: OIDC_EXTRA_LOG_REDACT_PATHS,
  });
}

export type OidcLogger = ReturnType<typeof createLogger>;
