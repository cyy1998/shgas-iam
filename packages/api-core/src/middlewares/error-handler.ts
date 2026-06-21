import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "pino";
import { ApiErrorCode } from "@iam/contracts";
import { HTTPException } from "hono/http-exception";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";
import { isApiRuntimeError } from "../errors/api-runtime-error";
import * as resp from "../http";
import { getTraceIdFromHeaders, SystemLogEvent } from "../logger";

type ErrorLogger = Pick<Logger, "error">;

function getErrorSourceLocation(err: Error): string {
  const stackLine = err.stack
    ?.split("\n")
    .slice(1)
    .find(line => line.trim().startsWith("at "));
  const location = stackLine?.match(/\(?((?:file:\/\/)?(?:\/|[A-Z]:[\\/]).*?:\d+:\d+)\)?$/i)?.[1];

  return location?.replace(/^file:\/\//, "") ?? "unknown source";
}

function getRequestLogger(c: Context): ErrorLogger | undefined {
  try {
    return c.get("logger" as never) as ErrorLogger | undefined;
  }
  catch {
    return undefined;
  }
}

function getRequestId(c: Context): string | undefined {
  try {
    return c.get("requestId" as never) as string | undefined;
  }
  catch {
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

function createRequestIdData(requestId: string | undefined) {
  return requestId ? { requestId } : {};
}

function getInternalErrorMessage(requestId: string | undefined) {
  return requestId ? "服务器内部错误，请联系管理员并提供 requestId" : "服务器内部错误";
}

export function createErrorHandler(appLogger: ErrorLogger) {
  return function errorHandler(err: Error | HTTPResponseError, c: Context) {
    if (isApiRuntimeError(err)) {
      return c.json(resp.fail(err.code, err.message), err.httpStatus as ContentfulStatusCode);
    }
    else if (err instanceof HTTPException) {
      const requestId = getRequestId(c);
      return c.json(resp.fail(ApiErrorCode.InternalError, err.message, createRequestIdData(requestId)), err.status);
    }
    else {
      const requestId = getRequestId(c);
      const logger = getRequestLogger(c) ?? appLogger;
      logger.error({
        event: SystemLogEvent.ApiErrorUnhandled,
        requestId,
        traceId: getTraceIdFromHeaders(name => getHeader(c, name)),
        method: c.req.method,
        path: c.req.path,
        route: getRoutePath(c),
        source: getErrorSourceLocation(err),
        errorName: err.name,
        errorMessage: err.message,
        err,
      }, "unhandled request error");
      return c.json(
        resp.fail(ApiErrorCode.InternalError, getInternalErrorMessage(requestId), createRequestIdData(requestId)),
        INTERNAL_SERVER_ERROR,
      );
    }
  };
}
