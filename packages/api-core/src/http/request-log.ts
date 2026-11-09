import { randomUUID } from "node:crypto";
import { type LoggerSourceAppValue, type LogLevel, SystemLogEvent } from "@iam/runtime/logger";

export type RequestHeaderValue = string | string[] | undefined | null;
export type RequestHeaderReader = (name: string) => RequestHeaderValue;

function firstHeaderValue(value: RequestHeaderValue) {
  if (Array.isArray(value)) return value.find((item) => item.trim() !== "");
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

export function getRequestIdFromHeaders(readHeader: RequestHeaderReader, generateId: () => string = randomUUID) {
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
  if (input.event === SystemLogEvent.ApiErrorUnhandled) return "error";
  if ((input.statusCode ?? 0) >= 500) return "error";
  if (input.statusCode === 403) return "warn";
  if (input.statusCode === 401 && (isInternalRoute(input.path) || isInternalRoute(input.route))) return "warn";
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
  return input.err !== undefined && (input.event === SystemLogEvent.ApiErrorUnhandled || input.statusCode >= 500);
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
  if (Array.isArray(path)) return path.length > 0 ? path.map((segment) => String(segment)).join(".") : "<root>";
  if (typeof path === "string" && path.trim() !== "") return path;
  return "<unknown>";
}

export function summarizeValidationIssues(issues: readonly ValidationIssueLike[]) {
  return {
    issueCount: issues.length,
    issuePaths: issues.map((issue) => formatValidationIssuePath(issue.path)),
  };
}
