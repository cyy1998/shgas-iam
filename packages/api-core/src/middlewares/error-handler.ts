import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";
import { ServiceStatusCode } from "@iam/contracts";
import { HTTPException } from "hono/http-exception";
import { AuthzError } from "../errors/AuthzError";
import { CustomError } from "../errors/CustomError";
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
  if (err instanceof CustomError) {
    return c.json(makeResponse(err.code, null, err.message));
  }
  else if (err instanceof AuthzError) {
    return c.json(makeResponse(err.code, null, err.message), err.httpCode);
  }
  else if (err instanceof HTTPException) {
    return c.json(makeResponse(err.status, null, err.message), err.status);
  }
  else {
    console.error(`[error] ${getErrorSourceLocation(err)}`, err);
    return c.json(makeResponse(ServiceStatusCode.Failure, null, "服务器内部错误"));
  }
}
