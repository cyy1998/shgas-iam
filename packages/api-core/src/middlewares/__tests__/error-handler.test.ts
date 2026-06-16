import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { BAD_REQUEST, NOT_FOUND } from "../../core/http-status-codes";
import { CustomError } from "../../errors/CustomError";
import { SystemLogEvent } from "../../logger";
import { createErrorHandler } from "../error-handler";

class DomainLikeBusinessError extends Error {
  public code = ApiErrorCode.OrganizationNotFound;
  public httpStatus = NOT_FOUND;

  constructor() {
    super("组织不存在");
    this.name = "OrganizationNotFoundError";
  }
}

function createMockLogger() {
  const error = mock((..._args: unknown[]) => undefined);
  return {
    error,
    logger: { error } as Parameters<typeof createErrorHandler>[0],
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
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.OrganizationNotFound,
      data: null,
      message: "组织不存在",
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

    app.get("/boom", () => {
      throw error;
    });
    app.onError(createErrorHandler(appLogger.logger));

    try {
      const res = await app.request("http://localhost/boom?trace=1");

      expect(consoleError).toHaveBeenCalledTimes(0);
      expect(appLogger.error).toHaveBeenCalledTimes(1);
      const [firstCall] = appLogger.error.mock.calls;
      expect(firstCall).toBeDefined();
      if (!firstCall) {
        throw new Error("logger.error was not called");
      }

      expect(firstCall[0]).toEqual({
        event: SystemLogEvent.ApiErrorUnhandled,
        requestId: undefined,
        source: sourceLocation,
        errorName: "Error",
        errorMessage: "boom",
      });
      expect(firstCall[1]).toBe("unhandled request error");
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        code: ApiErrorCode.InternalError,
        data: null,
        message: "服务器内部错误",
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
      await next();
    });
    app.get("/boom", () => {
      throw error;
    });
    app.onError(createErrorHandler(appLogger.logger));

    const res = await app.request("http://localhost/boom?trace=1");

    expect(appLogger.error).toHaveBeenCalledTimes(0);
    expect(requestLogger.error).toHaveBeenCalledTimes(1);
    const [firstCall] = requestLogger.error.mock.calls;
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("request logger.error was not called");
    }

    expect(firstCall[0]).toEqual({
      event: SystemLogEvent.ApiErrorUnhandled,
      requestId: undefined,
      source: sourceLocation,
      errorName: "Error",
      errorMessage: "boom",
    });
    expect(firstCall[1]).toBe("unhandled request error");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.InternalError,
      data: null,
      message: "服务器内部错误",
    });
  });
});
