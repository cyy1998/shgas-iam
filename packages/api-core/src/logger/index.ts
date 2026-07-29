import type { LoggerOptions, TransportTargetOptions } from "pino";
import { randomUUID } from "node:crypto";
import pino from "pino";

export type LogLevel = "info" | "warn" | "error";

export const LoggerSourceApp = {
  Api: "iam-api",
  AdminApi: "iam-admin-api",
  OidcProvider: "iam-oidc-provider",
  Worker: "iam-worker",
} as const;

export type LoggerSourceAppValue = typeof LoggerSourceApp[keyof typeof LoggerSourceApp];

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
  SessionNotificationFailed: "session.notification.failed",
  SessionNotificationUnexpectedResponse: "session.notification.unexpected_response",
  SessionKernelCleanupLegacyKeysCompleted: "session_kernel.cleanup_legacy_keys.completed",
  SessionKernelCleanupLegacyKeysFailed: "session_kernel.cleanup_legacy_keys.failed",
  SessionKernelSchemaCorrupted: "session_kernel.schema_corrupted",
  SessionKernelTombstoneReplayDetected: "session_kernel.tombstone_replay.detected",
  SessionKernelRevokeCleanupFailed: "session_kernel.revoke.cleanup_failed",
  AdminSessionRevokeUser: "admin.session_revoke.user",
  AdminSessionRevokeClientProtocol: "admin.session_revoke.client_protocol",
  AdminSessionRevokeClientAllProtocols: "admin.session_revoke.client_all_protocols",
  AdminSessionRevokeCleanupFailed: "admin.session_revoke.cleanup_failed",
  AdminLoginStateAuditFailedAfterEffect: "admin.login_state.audit_failed_after_effect",
  InternalAuthzChecked: "auth.internal_authorization.checked",
  OidcProviderStarted: "oidc.provider.started",
  OidcProviderStopping: "oidc.provider.stopping",
  OidcProviderServerError: "oidc.provider.server_error",
  OidcProviderProtocolError: "oidc.provider.protocol_error",
  OidcProviderHttpRequestFailed: "oidc.provider.http_request.failed",
  OidcClientInvalidationCleanupFailed: "oidc.client_invalidation.cleanup_failed",
} as const;

export function resolveLogFormat(logFormat: LogFormat = "auto", nodeEnv: string): ResolvedLogFormat {
  if (logFormat !== "auto")
    return logFormat;
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

export type RequestHeaderValue = string | string[] | undefined | null;
export type RequestHeaderReader = (name: string) => RequestHeaderValue;

function firstHeaderValue(value: RequestHeaderValue) {
  if (Array.isArray(value))
    return value.find(item => item.trim() !== "");
  return value?.trim() || undefined;
}

export function getHeaderValue(readHeader: RequestHeaderReader, name: string) {
  return firstHeaderValue(readHeader(name)) ?? firstHeaderValue(readHeader(name.toLowerCase()));
}

export function getTraceIdFromHeaders(readHeader: RequestHeaderReader) {
  const traceparent = getHeaderValue(readHeader, "traceparent");
  const traceId = traceparent?.match(/^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i)?.[1];
  return traceId ?? getHeaderValue(readHeader, "x-b3-traceid") ?? getHeaderValue(readHeader, "x-trace-id");
}

export function getRequestIdFromHeaders(
  readHeader: RequestHeaderReader,
  generateId: () => string = randomUUID,
) {
  return getHeaderValue(readHeader, "x-request-id") ?? generateId();
}

export function getClientIpFromHeaders(readHeader: RequestHeaderReader) {
  const forwardedFor = getHeaderValue(readHeader, "x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || getHeaderValue(readHeader, "x-real-ip");
}

export function getUserAgentFromHeaders(readHeader: RequestHeaderReader) {
  return getHeaderValue(readHeader, "user-agent");
}

export function getStatusLogLevel(_statusCode: number): LogLevel {
  return "info";
}

export type HttpRequestLogFieldInput = {
  requestId: string;
  readHeader: RequestHeaderReader;
  method: string;
  path: string;
  route: string;
  statusCode: number;
  durationMs: number;
  sourceApp?: LoggerSourceAppValue | string;
  aborted?: boolean;
  oidcRoute?: string;
};

export function buildHttpRequestLogFields(input: HttpRequestLogFieldInput) {
  return {
    event: SystemLogEvent.HttpRequestCompleted,
    sourceApp: input.sourceApp,
    requestId: input.requestId,
    traceId: getTraceIdFromHeaders(input.readHeader),
    method: input.method,
    path: input.path,
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    clientIp: getClientIpFromHeaders(input.readHeader),
    userAgent: getUserAgentFromHeaders(input.readHeader),
    aborted: input.aborted || undefined,
    oidcRoute: input.oidcRoute,
  };
}

export type ApiErrorLogSurface = "rest" | "trpc";

export type ApiErrorLogEvent = typeof SystemLogEvent.ApiErrorHandled | typeof SystemLogEvent.ApiErrorUnhandled;

export type ApiErrorLogLevelInput = {
  event: ApiErrorLogEvent;
  statusCode?: number;
  path?: string;
  route?: string;
};

function isInternalRoute(value: string | undefined) {
  return value === "/internal" || value?.startsWith("/internal/");
}

export function getApiErrorLogLevel(input: ApiErrorLogLevelInput): LogLevel {
  if (input.event === SystemLogEvent.ApiErrorUnhandled)
    return "error";
  if ((input.statusCode ?? 0) >= 500)
    return "error";
  if (input.statusCode === 403)
    return "warn";
  if (input.statusCode === 401 && (isInternalRoute(input.path) || isInternalRoute(input.route)))
    return "warn";
  return "info";
}

export type ApiErrorLogFieldInput = {
  event: ApiErrorLogEvent;
  surface: ApiErrorLogSurface;
  sourceApp?: LoggerSourceAppValue | string;
  requestId?: string;
  traceId?: string;
  method?: string;
  path?: string;
  route?: string;
  statusCode: number;
  errorCode?: string;
  errorName: string;
  errorMessage: string;
  err?: unknown;
  source?: string;
  procedurePath?: string;
  procedureType?: string;
  issueCount?: number;
  issuePaths?: string[];
};

function shouldIncludeErrorObject(input: ApiErrorLogFieldInput) {
  return input.err !== undefined
    && (input.event === SystemLogEvent.ApiErrorUnhandled || input.statusCode >= 500);
}

export function buildApiErrorLogFields(input: ApiErrorLogFieldInput) {
  const fields = {
    event: input.event,
    surface: input.surface,
    sourceApp: input.sourceApp,
    requestId: input.requestId,
    traceId: input.traceId,
    method: input.method,
    path: input.path,
    route: input.route,
    statusCode: input.statusCode,
    errorCode: input.errorCode,
    errorName: input.errorName,
    errorMessage: input.errorMessage,
    source: input.source,
    procedurePath: input.procedurePath,
    procedureType: input.procedureType,
    issueCount: input.issueCount,
    issuePaths: input.issuePaths,
  };

  return shouldIncludeErrorObject(input) ? { ...fields, err: input.err } : fields;
}

export type ValidationIssueLike = {
  path?: string | readonly unknown[];
};

function formatValidationIssuePath(path: ValidationIssueLike["path"]) {
  if (Array.isArray(path))
    return path.length > 0 ? path.map(segment => String(segment)).join(".") : "<root>";
  if (typeof path === "string" && path.trim() !== "")
    return path;
  return "<unknown>";
}

export function summarizeValidationIssues(issues: readonly ValidationIssueLike[]) {
  return {
    issueCount: issues.length,
    issuePaths: issues.map(issue => formatValidationIssuePath(issue.path)),
  };
}
