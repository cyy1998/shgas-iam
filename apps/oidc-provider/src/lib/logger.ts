import type { OidcProviderEnv } from "../env.ts";
import pino from "pino";

const REDACT_PATHS = [
  "*.secret",
  "*.secretHash",
  "*.oidcSecretHash",
  "*.code",
  "*.token",
  "*.accessToken",
  "*.idToken",
  "*.refreshToken",
  "*.codeVerifier",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
];

export function createLogger(env: Pick<OidcProviderEnv, "LOG_LEVEL">) {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
  });
}

export type OidcLogger = ReturnType<typeof createLogger>;
