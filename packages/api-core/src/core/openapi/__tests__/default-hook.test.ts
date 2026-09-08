import { createRoute, z } from "@hono/zod-openapi";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { SystemLogEvent } from "../../../logger";
import { createRouter } from "../../create-router";
import { OK, UNPROCESSABLE_ENTITY } from "../../http-status-codes";
import jsonContent from "../helpers/json-content";

const route = createRoute({
  method: "post",
  path: "/items",
  request: {
    body: jsonContent(z.object({
      name: z.string(),
    }), "item payload"),
  },
  responses: {
    [OK]: jsonContent(z.object({ ok: z.boolean() }), "ok"),
  },
});

describe("defaultHook", () => {
  test("returns standardized validation failure envelope and logs sanitized summary", async () => {
    const app = createRouter();
    const requestLogger = {
      info: mock((..._args: unknown[]) => undefined),
      error: mock((..._args: unknown[]) => undefined),
      warn: mock((..._args: unknown[]) => undefined),
      bindings: () => ({ sourceApp: "iam-api-test" }),
    };

    app.use("*", async (c, next) => {
      c.set("requestId" as never, "req-1" as never);
      c.set("logger" as never, requestLogger as never);
      await next();
    });
    app.openapi(route, c => c.json({ ok: true }));

    const res = await app.request("http://localhost/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
      },
      body: JSON.stringify({ name: 123 }),
    });
    const body = await res.json();

    expect(res.status).toBe(UNPROCESSABLE_ENTITY);
    expect(body).toEqual({
      code: ApiErrorCode.ValidationFailed,
      data: {
        requestId: "req-1",
        issues: expect.any(Array),
      },
      message: "请求参数不合法",
    });
    expect(body.data.issues[0]).toMatchObject({
      path: ["name"],
      message: expect.any(String),
    });
    expect(requestLogger.info).toHaveBeenCalledTimes(1);
    expect(requestLogger.error).toHaveBeenCalledTimes(0);
    expect(requestLogger.warn).toHaveBeenCalledTimes(0);
    const [firstCall] = requestLogger.info.mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      sourceApp: "iam-api-test",
      requestId: "req-1",
      traceId: "11111111111111111111111111111111",
      method: "POST",
      path: "/items",
      route: "/items",
      statusCode: UNPROCESSABLE_ENTITY,
      errorCode: ApiErrorCode.ValidationFailed,
      errorName: "ValidationError",
      errorMessage: "请求参数不合法",
      issueCount: expect.any(Number),
      issuePaths: expect.arrayContaining(["name"]),
    });
    expect(firstCall?.[0]).not.toHaveProperty("issues");
    expect(firstCall?.[0]).not.toHaveProperty("err");
  });
});
