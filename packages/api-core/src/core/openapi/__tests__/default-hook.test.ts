import { createRoute, z } from "@hono/zod-openapi";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
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
  test("returns standardized validation failure envelope without dedicated error logging", async () => {
    const app = createRouter();
    const requestLogger = {
      error: mock(() => undefined),
      warn: mock(() => undefined),
    };

    app.use("*", async (c, next) => {
      c.set("requestId" as never, "req-1" as never);
      c.set("logger" as never, requestLogger as never);
      await next();
    });
    app.openapi(route, c => c.json({ ok: true }));

    const res = await app.request("http://localhost/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    expect(body).not.toHaveProperty("success");
    expect(body).not.toHaveProperty("error");
    expect(requestLogger.error).toHaveBeenCalledTimes(0);
    expect(requestLogger.warn).toHaveBeenCalledTimes(0);
  });
});
