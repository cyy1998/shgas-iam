import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "@iam/contracts/http";
import { isApiRuntimeError } from "@iam/runtime/errors";
import { getLoggerSourceApp, SystemLogEvent } from "@iam/runtime/logger";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HTTPResponseError } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "pino";
import { getRequestId } from "../core/request-context";
import { getInternalErrorMessage } from "../http/internal-error-presentation";
import { buildApiErrorLogFields, getApiErrorLogLevel, getTraceIdFromHeaders } from "../http/request-log";
import * as resp from "../http/response";

type ErrorLogger = Pick<Logger, "info" | "warn" | "error"> & {
  bindings?: () => Record<string, unknown>;
};

function getErrorSourceLocation(err: Error): string {
  const stackLine = err.stack
    ?.split("\n")
    .slice(1)
    .find((line) => line.trim().startsWith("at "));
  const location = stackLine?.match(/\(?((?:file:\/\/)?(?:\/|[A-Z]:[\\/]).*?:\d+:\d+)\)?$/i)?.[1];

  return location?.replace(/^file:\/\//, "") ?? "unknown source";
}

function getRequestLogger(c: Context): ErrorLogger | undefined {
  try {
    return c.get("logger" as never) as ErrorLogger | undefined;
  } catch {
    return undefined;
  }
}

function getHeader(c: Context, name: string): string | undefined {
  return c.req.header(name) ?? c.req.header(name.toLowerCase());
}

function getRoutePath(c: Context) {
  const request = c.req as typeof c.req & { routePath?: string };
  return request.routePath ?? c.req.path;
}

function buildRestErrorContext(c: Context, logger: ErrorLogger, redactedPath?: string) {
  return {
    surface: "rest" as const,
    sourceApp: getLoggerSourceApp(logger),
    requestId: getRequestId(c),
    traceId: getTraceIdFromHeaders((name) => getHeader(c, name)),
    method: c.req.method,
    path: redactedPath ?? c.req.path,
    route: redactedPath ?? getRoutePath(c),
  };
}

function logApiError(logger: ErrorLogger, fields: Parameters<typeof buildApiErrorLogFields>[0], msg: string) {
  logger[getApiErrorLogLevel(fields)](buildApiErrorLogFields(fields), msg);
}

function createRequestIdData(requestId: string | undefined) {
  return requestId ? { requestId } : {};
}

function setRetryAfterHeader(err: { retryAfterSeconds?: number }, c: Context) {
  if (Number.isSafeInteger(err.retryAfterSeconds) && (err.retryAfterSeconds ?? 0) > 0)
    c.header("Retry-After", String(err.retryAfterSeconds));
}

export function createErrorHandler(appLogger: ErrorLogger, redactLogPath?: (path: string) => string | undefined) {
  return function errorHandler(err: Error | HTTPResponseError, c: Context) {
    const logger = getRequestLogger(c) ?? appLogger;
    const redactedPath = redactLogPath?.(c.req.path);
    const context = buildRestErrorContext(c, logger, redactedPath);
    const errorMessage = redactedPath !== undefined ? "Request error on redacted route" : err.message;
    const logError = redactedPath === undefined ? err : undefined;
    if (isApiRuntimeError(err)) {
      logApiError(
        logger,
        {
          ...context,
          event: SystemLogEvent.ApiErrorHandled,
          statusCode: err.httpStatus,
          errorCode: err.code,
          errorName: err.name,
          errorMessage,
          err: logError,
        },
        "handled request error",
      );
      setRetryAfterHeader(err, c);
      return c.json(resp.fail(err.code, err.message), err.httpStatus as ContentfulStatusCode);
    } else if (err instanceof HTTPException) {
      const requestId = getRequestId(c);
      logApiError(
        logger,
        {
          ...context,
          event: SystemLogEvent.ApiErrorHandled,
          statusCode: err.status,
          errorCode: ApiErrorCode.InternalError,
          errorName: err.name === "Error" ? "HTTPException" : err.name,
          errorMessage,
          err: logError,
        },
        "handled request error",
      );
      return c.json(resp.fail(ApiErrorCode.InternalError, err.message, createRequestIdData(requestId)), err.status);
    } else {
      const requestId = getRequestId(c);
      logApiError(
        logger,
        {
          ...context,
          event: SystemLogEvent.ApiErrorUnhandled,
          statusCode: INTERNAL_SERVER_ERROR,
          errorCode: ApiErrorCode.InternalError,
          source: getErrorSourceLocation(err),
          errorName: err.name,
          errorMessage,
          err: logError,
        },
        "unhandled request error",
      );
      return c.json(
        resp.fail(ApiErrorCode.InternalError, getInternalErrorMessage(requestId), createRequestIdData(requestId)),
        INTERNAL_SERVER_ERROR,
      );
    }
  };
}
