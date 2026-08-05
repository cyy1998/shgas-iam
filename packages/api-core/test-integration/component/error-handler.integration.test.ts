import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } from "../../src/core/http-status-codes";
import { BadRequestError } from "../../src/errors/BadRequestError";
import { CustomError } from "../../src/errors/CustomError";
import { SystemLogEvent } from "../../src/logger";
import { createErrorHandler } from "../../src/middlewares/error-handler";

class DomainLikeBusinessError extends Error {
  public code = ApiErrorCode.OrganizationNotFound;
  public httpStatus = NOT_FOUND;

  constructor() {
    super("组织不存在");
    this.name = "OrganizationNotFoundError";
  }
}

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
      bindings: () => ({ sourceApp: "iam-api-test" }),
    } as Parameters<typeof createErrorHandler>[0],
  };
}

describe("errorHandler", () => {
  test("serializes CustomError code and HTTP status separately", async () => {
    const app = new Hono();
    const appLogger = createMockLogger();
    app.get("/custom", () => {
      throw new CustomError("登录凭证无效", {
        code: ApiErrorCode.InvalidLoginCredential,
        httpStatus: BAD_REQUEST,
      });
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/custom");

    expect(res.status).toBe(BAD_REQUEST);
    expect(appLogger.info).toHaveBeenCalledTimes(1);
    const [firstCall] = appLogger.info.mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      sourceApp: "iam-api-test",
      method: "GET",
      path: "/custom",
      route: "/custom",
      statusCode: BAD_REQUEST,
      errorCode: ApiErrorCode.InvalidLoginCredential,
      errorName: "CustomError",
      errorMessage: "登录凭证无效",
    });
    expect(firstCall?.[0]).not.toHaveProperty("err");
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.InvalidLoginCredential,
      data: null,
      message: "登录凭证无效",
    });
  });

  test("serializes domain business error shape", async () => {
    const app = new Hono();
    const appLogger = createMockLogger();
    app.get("/domain", () => {
      throw new DomainLikeBusinessError();
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/domain");

    expect(res.status).toBe(NOT_FOUND);
    expect(appLogger.info).toHaveBeenCalledTimes(1);
    expect(appLogger.info.mock.calls[0]?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      statusCode: NOT_FOUND,
      errorCode: ApiErrorCode.OrganizationNotFound,
      errorName: "OrganizationNotFoundError",
      errorMessage: "组织不存在",
    });
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.OrganizationNotFound,
      data: null,
      message: "组织不存在",
    });
  });

  test("serializes BadRequestError as handled 400 without internal error code", async () => {
    const app = new Hono();
    const appLogger = createMockLogger();
    app.get("/bad-request", () => {
      throw new BadRequestError("非法请求");
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/bad-request");

    expect(res.status).toBe(BAD_REQUEST);
    expect(appLogger.info).toHaveBeenCalledTimes(1);
    expect(appLogger.error).toHaveBeenCalledTimes(0);
    expect(appLogger.info.mock.calls[0]?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      statusCode: BAD_REQUEST,
      errorCode: ApiErrorCode.BadRequest,
      errorName: "BadRequestError",
      errorMessage: "非法请求",
    });
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.BadRequest,
      data: null,
      message: "非法请求",
    });
  });

  test("serializes HTTPException with preserved status and requestId data", async () => {
    const app = new Hono();
    const appLogger = createMockLogger();
    app.use("*", async (c, next) => {
      c.set("requestId" as never, "req-http" as never);
      await next();
    });
    app.get("/http-exception", () => {
      throw new HTTPException(BAD_REQUEST, { message: "bad request" });
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/http-exception");

    expect(res.status).toBe(BAD_REQUEST);
    expect(appLogger.info).toHaveBeenCalledTimes(1);
    expect(appLogger.error).toHaveBeenCalledTimes(0);
    expect(appLogger.info.mock.calls[0]?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      requestId: "req-http",
      statusCode: BAD_REQUEST,
      errorCode: ApiErrorCode.InternalError,
      errorName: "HTTPException",
      errorMessage: "bad request",
    });
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.InternalError,
      data: { requestId: "req-http" },
      message: "bad request",
    });
  });

  test("logs the source file location with the app logger when request logger is unavailable", async () => {
    const app = new Hono();
    const error = new Error("boom");
    const sourceLocation = `${process.cwd()}/apps/api/src/routes/auth/auth.handlers.ts:12:34`;
    error.stack = [
      "Error: boom",
      `    at explode (${sourceLocation})`,
      "    at async dispatch (node_modules/hono/dist/compose.js:22:17)",
    ].join("\n");
    const appLogger = createMockLogger();
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    app.use("*", async (c, next) => {
      c.set("requestId" as never, "req-app" as never);
      await next();
    });
    app.get("/boom", () => {
      throw error;
    });
    app.onError(createErrorHandler(appLogger.logger));

    try {
      const res = await app.request("http://localhost/boom?trace=1", {
        headers: {
          traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        },
      });

      expect(consoleError).toHaveBeenCalledTimes(0);
      expect(appLogger.error).toHaveBeenCalledTimes(1);
      const [firstCall] = appLogger.error.mock.calls;
      expect(firstCall).toBeDefined();
      if (!firstCall) {
        throw new Error("logger.error was not called");
      }

      expect(firstCall[0]).toMatchObject({
        event: SystemLogEvent.ApiErrorUnhandled,
        surface: "rest",
        sourceApp: "iam-api-test",
        requestId: "req-app",
        traceId: "11111111111111111111111111111111",
        method: "GET",
        path: "/boom",
        route: "/boom",
        statusCode: INTERNAL_SERVER_ERROR,
        errorCode: ApiErrorCode.InternalError,
        source: sourceLocation,
        errorName: "Error",
        errorMessage: "boom",
        err: error,
      });
      expect(firstCall[1]).toBe("unhandled request error");
      expect(res.status).toBe(INTERNAL_SERVER_ERROR);
      await expect(res.json()).resolves.toEqual({
        code: ApiErrorCode.InternalError,
        data: { requestId: "req-app" },
        message: "服务器内部错误，请联系管理员并提供 requestId",
      });
    }
    finally {
      consoleError.mockRestore();
    }
  });

  test("prefers the request logger when logging unexpected errors", async () => {
    const app = new Hono<{ Variables: { logger: Parameters<typeof createErrorHandler>[0] } }>();
    const error = new Error("boom");
    const sourceLocation = `${process.cwd()}/apps/api/src/routes/auth/auth.handlers.ts:56:78`;
    error.stack = [
      "Error: boom",
      `    at explode (${sourceLocation})`,
      "    at async dispatch (node_modules/hono/dist/compose.js:22:17)",
    ].join("\n");
    const appLogger = createMockLogger();
    const requestLogger = createMockLogger();

    app.use("*", async (c, next) => {
      c.set("logger", requestLogger.logger);
      c.set("requestId" as never, "req-request" as never);
      await next();
    });
    app.get("/boom", () => {
      throw error;
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/boom?trace=1", {
      headers: {
        "x-b3-traceid": "22222222222222222222222222222222",
      },
    });

    expect(appLogger.error).toHaveBeenCalledTimes(0);
    expect(requestLogger.error).toHaveBeenCalledTimes(1);
    const [firstCall] = requestLogger.error.mock.calls;
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("request logger.error was not called");
    }

    expect(firstCall[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorUnhandled,
      surface: "rest",
      sourceApp: "iam-api-test",
      requestId: "req-request",
      traceId: "22222222222222222222222222222222",
      method: "GET",
      path: "/boom",
      route: "/boom",
      statusCode: INTERNAL_SERVER_ERROR,
      errorCode: ApiErrorCode.InternalError,
      source: sourceLocation,
      errorName: "Error",
      errorMessage: "boom",
      err: error,
    });
    expect(firstCall[1]).toBe("unhandled request error");
    expect(res.status).toBe(INTERNAL_SERVER_ERROR);
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.InternalError,
      data: { requestId: "req-request" },
      message: "服务器内部错误，请联系管理员并提供 requestId",
    });
  });
});
