import type { LoggerOptions, TransportTargetOptions } from "pino";
import pino from "pino";
import { createSingleton } from "../core/singleton";

export type LoggerConfig = {
  nodeEnv: string;
  logLevel?: string;
  sourceApp?: string;
};

export const IAM_LOG_REDACT_PATHS = [
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie",
  "*.authorization",
  "*.Authorization",
  "*.cookie",
  "*.Cookie",
  "*.set-cookie",
  "*.Set-Cookie",
  "*.password",
  "*.Password",
  "*.token",
  "*.Token",
  "*.accessToken",
  "*.idToken",
  "*.refreshToken",
  "*.clientSecret",
  "*.secret",
  "*.privateKey",
  "*.verificationCode",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "err.config.headers.Authorization",
  "err.config.headers.authorization",
  "err.response.config.headers.Authorization",
  "err.response.config.headers.authorization",
] as const;

export const SystemLogEvent = {
  ApiErrorUnhandled: "api.error.unhandled",
  HttpRequestCompleted: "http.request.completed",
  HumanVerificationMissing: "human_verification.token.missing",
  HumanVerificationMismatch: "human_verification.token.action_mismatch",
  HumanVerificationFailed: "human_verification.token.validation_failed",
  HumanVerificationValidated: "human_verification.token.validated",
  HumanVerificationRequired: "human_verification.required",
  IntegrationCallFailed: "integration.call.failed",
  IntegrationUnexpectedResponse: "integration.call.unexpected_response",
  RedirectPatternInvalid: "sso.redirect_pattern.invalid",
  SessionNotificationFailed: "session.notification.failed",
  SessionNotificationUnexpectedResponse: "session.notification.unexpected_response",
  InternalAuthzChecked: "auth.internal_authorization.checked",
  OidcProviderStarted: "oidc.provider.started",
  OidcProviderStopping: "oidc.provider.stopping",
  OidcProviderServerError: "oidc.provider.server_error",
  OidcProviderProtocolError: "oidc.provider.protocol_error",
  OidcProviderHttpRequestFailed: "oidc.provider.http_request.failed",
  OidcClientInvalidationCleanupFailed: "oidc.client_invalidation.cleanup_failed",
} as const;

function buildLoggerOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.logLevel || "info",
    redact: {
      paths: [...IAM_LOG_REDACT_PATHS],
      censor: "[REDACTED]",
    },
  };
}

function buildTransportTargets(config: LoggerConfig): TransportTargetOptions[] {
  const level = config.logLevel || "info";
  if (config.nodeEnv === "development") {
    return [{ target: "pino-pretty", level, options: {} }];
  }
  return [{ target: "pino/file", level, options: { destination: 1 } }];
}

export function createLogger(config: LoggerConfig) {
  return createSingleton("logger", () => {
    const logger = pino(buildLoggerOptions(config), pino.transport({ targets: buildTransportTargets(config) }));
    return config.sourceApp ? logger.child({ sourceApp: config.sourceApp }) : logger;
  });
}
