import { expect, test } from "bun:test";
import { createCustomSsoRetryableErrorMapper } from "@iam/api-core/http/custom-sso-retryable";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { ApiErrorCode } from "@iam/contracts";
import { Hono } from "hono";
import pino from "pino";

test("maps injected protocol unavailability to a sanitized retryable HTTP response", async () => {
  const unavailable = new Error("upstream failure containing internal diagnostics");
  const mapError = createCustomSsoRetryableErrorMapper({
    classifyUnavailable: (error) => (error === unavailable ? ApiErrorCode.InternalError : undefined),
  });
  const app = new Hono();
  app.onError(createErrorHandler(pino({ level: "silent" })));
  app.get("/", () => {
    throw mapError(unavailable, { retryAfterSeconds: 7 });
  });

  const response = await app.request("/");
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("7");
  expect(body).toMatchObject({ code: ApiErrorCode.InternalError, message: "服务暂时不可用" });
});
