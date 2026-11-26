import { expect, test } from "bun:test";
import { ApiErrorCode } from "@iam/contracts";
import pino from "pino";
import createApp from "../create-app";

test("returns a 404 envelope with the method and path for an unmatched request", async () => {
  const app = createApp(
    { openapi: { enabled: false }, tiers: [] },
    { env: {}, logger: pino({ level: "silent" }), routes: {}, middlewares: {} },
  );

  const response = await app.request("/missing/path?trace=1", { method: "POST" });
  const body = await response.json();

  expect(response.status).toBe(404);
  expect(body).toEqual({
    code: ApiErrorCode.NotFound,
    data: null,
    message: "未找到 - POST:/missing/path",
  });
});
