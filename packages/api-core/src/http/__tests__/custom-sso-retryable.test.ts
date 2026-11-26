import { expect, test } from "bun:test";
import { mapCustomSsoRetryableError } from "@iam/api-core/http/custom-sso-retryable";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { ApiErrorCode, RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";
import { Hono } from "hono";
import pino from "pino";

test.each([
  [undefined, ApiErrorCode.InternalError, "服务暂时不可用"],
  [ApiErrorCode.SubjectProjectionNotReady, ApiErrorCode.SubjectProjectionNotReady, "主体信息暂未就绪"],
] as const)(
  "maps marked unavailability (%s) to a sanitized retryable HTTP response",
  async (code, expected, message) => {
    const unavailable = Object.assign(new Error("upstream failure containing internal diagnostics"), {
      retryability: RETRYABLE_SERVICE_UNAVAILABLE,
      code,
    });
    const app = new Hono();
    app.onError(createErrorHandler(pino({ level: "silent" })));
    app.get("/", () => {
      throw mapCustomSsoRetryableError(unavailable, { retryAfterSeconds: 7 });
    });

    const response = await app.request("/");
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(body).toMatchObject({ code: expected, message });
  },
);
