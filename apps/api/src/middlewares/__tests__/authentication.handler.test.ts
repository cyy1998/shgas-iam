import { createApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

function createMockLogger() {
  const info = mock((..._args: unknown[]) => undefined);
  const warn = mock((..._args: unknown[]) => undefined);
  const error = mock((..._args: unknown[]) => undefined);
  return {
    info,
    warn,
    error,
    bindings: () => ({ sourceApp: "iam-api-test" }),
  };
}

describe("publicAuthenticationHandler", () => {
  test("returns bad request when Client header is missing", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientByCode: mock(async () => null),
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolveLocalSessionContext: mock(async () => {
          throw new Error("session should not be resolved");
        }),
        resolvePrincipalSessionUser: mock(async () => {
          throw new Error("principal should not be resolved");
        }),
      },
      redis: {} as never,
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/ping");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.BadRequest,
      data: null,
      message: "非法请求",
    });
  });
});
