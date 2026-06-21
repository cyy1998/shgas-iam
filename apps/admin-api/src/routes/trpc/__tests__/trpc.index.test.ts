import { NOT_FOUND } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { SystemLogEvent } from "@iam/api-core/logger";
import { mapCustomErrorToTRPCError, publicProcedure, router } from "@iam/api-core/trpc";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { createTrpcRoute } from "../trpc.index";

type TrpcErrorResponse = {
  error: {
    message: string;
    data: {
      serviceCode?: string;
      serviceMessage?: string;
      httpStatus?: number;
    };
  };
};

function createMockLogger() {
  const info = mock((..._args: unknown[]) => undefined);
  const warn = mock((..._args: unknown[]) => undefined);
  const error = mock((..._args: unknown[]) => undefined);
  return {
    info,
    warn,
    error,
    logger: {
      info,
      warn,
      error,
      bindings: () => ({ sourceApp: "iam-admin-api-test" }),
    },
  };
}

function createTestApp(logger: ReturnType<typeof createMockLogger>["logger"], unknownError = new Error("boom")) {
  const appRouter = router({
    known: publicProcedure.query(() => {
      try {
        throw new CustomError("missing", {
          code: ApiErrorCode.OrganizationNotFound,
          httpStatus: NOT_FOUND,
        });
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),
    unknown: publicProcedure.query(() => {
      throw unknownError;
    }),
  });
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("logger" as never, logger as never);
    c.set("requestId" as never, "req-trpc" as never);
    await next();
  });
  app.route("/rpc", createTrpcRoute(appRouter as never));
  return app;
}

describe("createTrpcRoute error logging", () => {
  test("logs mapped API runtime errors as handled without changing tRPC formatter data", async () => {
    const logger = createMockLogger();
    const app = createTestApp(logger.logger);

    const res = await app.request("http://localhost/rpc/known", {
      headers: {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      },
    });
    const body = await res.json() as TrpcErrorResponse;

    expect(res.status).toBe(NOT_FOUND);
    expect(body.error).toMatchObject({
      message: "missing",
      data: {
        serviceCode: ApiErrorCode.OrganizationNotFound,
        serviceMessage: "missing",
        httpStatus: NOT_FOUND,
      },
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(0);
    const [firstCall] = logger.info.mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "trpc",
      sourceApp: "iam-admin-api-test",
      requestId: "req-trpc",
      traceId: "11111111111111111111111111111111",
      method: "GET",
      path: "/rpc/known",
      statusCode: NOT_FOUND,
      errorCode: ApiErrorCode.OrganizationNotFound,
      errorName: "CustomError",
      errorMessage: "missing",
      procedurePath: "known",
      procedureType: "query",
    });
    expect(firstCall?.[0]).not.toHaveProperty("err");
  });

  test("logs unknown tRPC errors as unhandled with the original error", async () => {
    const logger = createMockLogger();
    const unknownError = new Error("boom");
    const app = createTestApp(logger.logger, unknownError);

    const res = await app.request("http://localhost/rpc/unknown");

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [firstCall] = logger.error.mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorUnhandled,
      surface: "trpc",
      sourceApp: "iam-admin-api-test",
      requestId: "req-trpc",
      method: "GET",
      path: "/rpc/unknown",
      statusCode: 500,
      errorCode: ApiErrorCode.InternalError,
      errorName: "TRPCError",
      errorMessage: "boom",
      err: unknownError,
      procedurePath: "unknown",
      procedureType: "query",
    });
  });
});
