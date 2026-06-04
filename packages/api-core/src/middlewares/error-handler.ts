import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiErrorCode } from "@iam/contracts";
import { HTTPException } from "hono/http-exception";
import { isApiRuntimeError } from "../errors/api-runtime-error";
import { makeResponse } from "../http";

function getErrorSourceLocation(err: Error): string {
  const stackLine = err.stack
    ?.split("\n")
    .slice(1)
    .find(line => line.trim().startsWith("at "));
  const location = stackLine?.match(/\(?((?:file:\/\/)?(?:\/|[A-Z]:[\\/]).*?:\d+:\d+)\)?$/i)?.[1];

  return location?.replace(/^file:\/\//, "") ?? "unknown source";
}

export function errorHandler(err: Error | HTTPResponseError, c: Context) {
  if (isApiRuntimeError(err)) {
    return c.json(makeResponse(err.code, null, err.message), err.httpStatus as ContentfulStatusCode);
  }
  else if (err instanceof HTTPException) {
    return c.json(makeResponse(ApiErrorCode.InternalError, null, err.message), err.status);
  }
  else {
    console.error(`[error] ${getErrorSourceLocation(err)}`, err);
    return c.json(makeResponse(ApiErrorCode.InternalError, null, "服务器内部错误"));
  }
}
