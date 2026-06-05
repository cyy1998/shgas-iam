import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "pino";
import { ApiErrorCode } from "@iam/contracts";
import { HTTPException } from "hono/http-exception";
import { isApiRuntimeError } from "../errors/api-runtime-error";
import { makeResponse } from "../http";

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

export function createErrorHandler(appLogger: ErrorLogger) {
  return function errorHandler(err: Error | HTTPResponseError, c: Context) {
    if (isApiRuntimeError(err)) {
      return c.json(makeResponse(err.code, null, err.message), err.httpStatus as ContentfulStatusCode);
    }
    else if (err instanceof HTTPException) {
      return c.json(makeResponse(ApiErrorCode.InternalError, null, err.message), err.status);
    }
    else {
      const logger = getRequestLogger(c) ?? appLogger;
      logger.error({ err, source: getErrorSourceLocation(err) }, "unhandled request error");
      return c.json(makeResponse(ApiErrorCode.InternalError, null, "服务器内部错误"));
    }
  };
}
