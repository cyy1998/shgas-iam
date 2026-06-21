import type { Hook } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { Logger } from "pino";

import { ApiErrorCode } from "@iam/contracts";
import * as resp from "../../http";
import {
  buildApiErrorLogFields,
  getLoggerSourceApp,
  getTraceIdFromHeaders,
  summarizeValidationIssues,
  SystemLogEvent,
} from "../../logger";
import { UNPROCESSABLE_ENTITY } from "../http-status-codes";

type ValidationLogger = Pick<Logger, "info"> & {
  bindings?: () => Record<string, unknown>;
};

function getRequestId(c: Context): string | undefined {
  try {
    return c.get("requestId" as never) as string | undefined;
  }
  catch {
    return undefined;
  }
}

function getRequestLogger(c: Context): ValidationLogger | undefined {
  try {
    return c.get("logger" as never) as ValidationLogger | undefined;
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

const defaultHook: Hook<any, any, any, any> = (result, c) => {
  if (!result.success) {
    const logger = getRequestLogger(c);
    const requestId = getRequestId(c);
    logger?.info(buildApiErrorLogFields({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      sourceApp: getLoggerSourceApp(logger),
      requestId,
      traceId: getTraceIdFromHeaders(name => getHeader(c, name)),
      method: c.req.method,
      path: c.req.path,
      route: getRoutePath(c),
      statusCode: UNPROCESSABLE_ENTITY,
      errorCode: ApiErrorCode.ValidationFailed,
      errorName: "ValidationError",
      errorMessage: "请求参数不合法",
      ...summarizeValidationIssues(result.error.issues),
    }), "handled request error");

    return c.json(
      resp.fail(ApiErrorCode.ValidationFailed, "请求参数不合法", {
        requestId,
        issues: result.error.issues,
      }),
      UNPROCESSABLE_ENTITY,
    );
  }
};

export default defaultHook;
