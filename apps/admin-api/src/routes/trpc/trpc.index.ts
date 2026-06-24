import type { AppRouter } from "@admin-api/trpc/trpc.router";
import type { AnyRouter } from "@iam/api-core/core/create-app";
import type { TRPCError } from "@trpc/server";
import type { Context } from "hono";
import type { Logger } from "pino";
import { createRouter } from "@iam/api-core/core/create-router";
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  UNAUTHORIZED,
} from "@iam/api-core/core/http-status-codes";
import { getRequestId } from "@iam/api-core/core/request-context";
import { isApiRuntimeError } from "@iam/api-core/errors";
import {
  buildApiErrorLogFields,
  getApiErrorLogLevel,
  getLoggerSourceApp,
  getTraceIdFromHeaders,
  LoggerSourceApp,
  SystemLogEvent,
} from "@iam/api-core/logger";
import { createTRPCContext } from "@iam/api-core/trpc";
import { ApiErrorCode } from "@iam/contracts";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

type TrpcErrorLogger = Pick<Logger, "info" | "warn" | "error"> & {
  bindings?: () => Record<string, unknown>;
};

function getRequestLogger(c: Context): TrpcErrorLogger | undefined {
  try {
    return c.get("logger" as never) as TrpcErrorLogger | undefined;
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

function mapTRPCErrorCodeToStatus(code: TRPCError["code"]) {
  if (code === "BAD_REQUEST")
    return BAD_REQUEST;
  if (code === "UNAUTHORIZED")
    return UNAUTHORIZED;
  if (code === "FORBIDDEN")
    return FORBIDDEN;
  if (code === "NOT_FOUND")
    return NOT_FOUND;
  if (code === "CONFLICT")
    return CONFLICT;
  return INTERNAL_SERVER_ERROR;
}

export function createTrpcRoute(appRouter: AppRouter): AnyRouter {
  return createRouter().all("/*", async (c) => {
    return await fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
      onError({ error, path, type }) {
        const logger = getRequestLogger(c);
        if (!logger)
          return;

        const apiRuntimeCause = isApiRuntimeError(error.cause) ? error.cause : null;
        const event = apiRuntimeCause ? SystemLogEvent.ApiErrorHandled : SystemLogEvent.ApiErrorUnhandled;
        const statusCode = apiRuntimeCause?.httpStatus ?? mapTRPCErrorCodeToStatus(error.code);
        const fields = buildApiErrorLogFields({
          event,
          surface: "trpc",
          sourceApp: getLoggerSourceApp(logger, LoggerSourceApp.AdminApi),
          requestId: getRequestId(c),
          traceId: getTraceIdFromHeaders(name => getHeader(c, name)),
          method: c.req.method,
          path: c.req.path,
          route: getRoutePath(c),
          statusCode,
          errorCode: apiRuntimeCause?.code ?? ApiErrorCode.InternalError,
          errorName: apiRuntimeCause?.name ?? error.name,
          errorMessage: apiRuntimeCause?.message ?? error.message,
          err: apiRuntimeCause ?? error.cause ?? error,
          procedurePath: path,
          procedureType: type === "unknown" ? undefined : type,
        });

        logger[getApiErrorLogLevel({ event, statusCode, path: c.req.path, route: getRoutePath(c) })](
          fields,
          apiRuntimeCause ? "handled tRPC request error" : "unhandled tRPC request error",
        );
      },
    });
  }) as AnyRouter;
}
