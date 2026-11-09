import type { LoggerOptions, TransportTargetOptions } from "pino";
import pino from "pino";

export type LogLevel = "info" | "warn" | "error";

export const LoggerSourceApp = {
  Api: "iam-api",
  AdminApi: "iam-admin-api",
  OidcProvider: "iam-oidc-provider",
  Worker: "iam-worker",
  Ops: "iam-ops",
} as const;

export type LoggerSourceAppValue = (typeof LoggerSourceApp)[keyof typeof LoggerSourceApp];

export type LogFormat = "auto" | "json" | "pretty";

export type ResolvedLogFormat = Exclude<LogFormat, "auto">;

export type LoggerConfig = {
  nodeEnv: string;
  logLevel?: string;
  logFormat?: LogFormat;
  sourceApp?: LoggerSourceAppValue;
  extraRedactPaths?: readonly string[];
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
  ApiErrorHandled: "api.error.handled",
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
  SsoLegacyBearerSourceUsed: "sso.legacy_bearer_source.used",
  SubjectFactsOperationObserved: "subject_facts.operation.observed",
  ClientRuntimeSnapshotOperationObserved: "client_runtime_snapshot.operation.observed",
  AdminSessionRevokeUser: "admin.session_revoke.user",
  AdminSessionRevokeClientProtocol: "admin.session_revoke.client_protocol",
  AdminSessionRevokeClientAllProtocols: "admin.session_revoke.client_all_protocols",
  AdminSessionRevokeCleanupFailed: "admin.session_revoke.cleanup_failed",
  AdminLoginStateAuditFailedAfterEffect: "admin.login_state.audit_failed_after_effect",
  AdminAuthorizationDenied: "admin.authorization.denied",
  InternalAuthzChecked: "auth.internal_authorization.checked",
  OidcProviderStarted: "oidc.provider.started",
  OidcProviderStopping: "oidc.provider.stopping",
  OidcProviderServerError: "oidc.provider.server_error",
  OidcProviderProtocolError: "oidc.provider.protocol_error",
  OidcProviderHttpRequestFailed: "oidc.provider.http_request.failed",
} as const;

export function resolveLogFormat(logFormat: LogFormat = "auto", nodeEnv: string): ResolvedLogFormat {
  if (logFormat !== "auto") return logFormat;
  return nodeEnv === "development" ? "pretty" : "json";
}

export function mergeRedactPaths(extraRedactPaths: readonly string[] = []) {
  return [...new Set([...IAM_LOG_REDACT_PATHS, ...extraRedactPaths])];
}

export function buildLoggerOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.logLevel || "info",
    redact: {
      paths: mergeRedactPaths(config.extraRedactPaths),
      censor: "[REDACTED]",
    },
  };
}

export function buildLoggerTransportTargets(config: LoggerConfig): TransportTargetOptions[] | undefined {
  const level = config.logLevel || "info";
  if (resolveLogFormat(config.logFormat, config.nodeEnv) === "pretty") {
    return [{ target: "pino-pretty", level, options: {} }];
  }
  return undefined;
}

export function createLogger(config: LoggerConfig) {
  const transportTargets = buildLoggerTransportTargets(config);
  const logger = transportTargets
    ? pino(buildLoggerOptions(config), pino.transport({ targets: transportTargets }))
    : pino(buildLoggerOptions(config));
  return config.sourceApp ? logger.child({ sourceApp: config.sourceApp }) : logger;
}

export type LoggerBindingsReader = {
  bindings?: () => Record<string, unknown>;
};

export function getLoggerSourceApp(
  logger: LoggerBindingsReader | undefined,
  fallback: LoggerSourceAppValue | string = LoggerSourceApp.Api,
) {
  const sourceApp = logger?.bindings?.().sourceApp;
  return typeof sourceApp === "string" ? sourceApp : fallback;
}
