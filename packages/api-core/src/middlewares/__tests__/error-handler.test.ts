import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { BAD_REQUEST, NOT_FOUND } from "../../core/http-status-codes";
import { CustomError } from "../../errors/CustomError";
import { errorHandler } from "../error-handler";

class DomainLikeBusinessError extends Error {
  public code = ApiErrorCode.OrganizationNotFound;
  public httpStatus = NOT_FOUND;

  constructor() {
    super("组织不存在");
    this.name = "OrganizationNotFoundError";
  }
}

describe("errorHandler", () => {
  test("serializes CustomError code and HTTP status separately", async () => {
    const app = new Hono();
    app.get("/custom", () => {
      throw new CustomError("登录凭证无效", {
        code: ApiErrorCode.InvalidLoginCredential,
        httpStatus: BAD_REQUEST,
      });
    });
    app.onError(errorHandler);

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
    app.get("/domain", () => {
      throw new DomainLikeBusinessError();
    });
    app.onError(errorHandler);

    const res = await app.request("http://localhost/domain");

    expect(res.status).toBe(NOT_FOUND);
    await expect(res.json()).resolves.toEqual({
      code: ApiErrorCode.OrganizationNotFound,
      data: null,
      message: "组织不存在",
    });
  });

  test("prints the source file location when logging unexpected errors", async () => {
    const app = new Hono();
    const error = new Error("boom");
    const sourceLocation = `${process.cwd()}/apps/api/src/routes/auth/auth.handlers.ts:12:34`;
    error.stack = [
      "Error: boom",
      `    at explode (${sourceLocation})`,
      "    at async dispatch (node_modules/hono/dist/compose.js:22:17)",
    ].join("\n");
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    app.get("/boom", () => {
      throw error;
    });
    app.onError(errorHandler);

    try {
      const res = await app.request("http://localhost/boom?trace=1");

      expect(consoleError).toHaveBeenCalledTimes(1);
      const [firstCall] = consoleError.mock.calls;
      expect(firstCall).toBeDefined();
      if (!firstCall) {
        throw new Error("console.error was not called");
      }

      expect(firstCall[0]).toContain(sourceLocation);
      expect(firstCall[1]).toBe(error);
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
});
