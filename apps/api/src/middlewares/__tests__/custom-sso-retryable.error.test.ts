import { CustomSsoClientRuntimeUnavailableError } from "@api/services/client/custom-sso-client-runtime.reader";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { mapCustomSsoRetryableError } from "../custom-sso-retryable.error";

describe("Custom SSO retryable HTTP error adapter", () => {
  test("maps Not Ready to a sanitized 503 with configurable Retry-After", async () => {
    const info = mock((..._args: unknown[]) => undefined);
    const warn = mock((..._args: unknown[]) => undefined);
    const error = mock((..._args: unknown[]) => undefined);
    const logger = {
      info,
      warn,
      error,
      bindings: () => ({ sourceApp: "iam-api-test" }),
    } as Parameters<typeof createErrorHandler>[0];
    const internal = Object.assign(new SubjectProjectionNotReadyError(), {
      dirtyStatus: "processing",
      dirtyVersion: "73",
      subjectFacts: {
        profile: {
          username: "must-not-leak",
        },
      },
    });
    const app = new Hono();
    app.get("/sso", () => {
      throw mapCustomSsoRetryableError(internal, {
        retryAfterSeconds: 3,
      });
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/sso");

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SubjectProjectionNotReady,
      message: "主体信息暂未就绪",
      data: null,
    });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([
      info.mock.calls,
      warn.mock.calls,
      error.mock.calls,
    ]);
    expect(logged).not.toContain("processing");
    expect(logged).not.toContain("73");
    expect(logged).not.toContain("must-not-leak");
  });

  test("does not reinterpret errors outside the known retryable results", () => {
    const oidcProtocolError = new Error("temporarily_unavailable");

    expect(mapCustomSsoRetryableError(oidcProtocolError, {
      retryAfterSeconds: 3,
    })).toBe(oidcProtocolError);
  });

  test("maps typed client runtime uncertainty without exposing its cause", async () => {
    const mapped = mapCustomSsoRetryableError(
      new CustomSsoClientRuntimeUnavailableError({
        cause: new Error("redis://secret@internal"),
      }),
      { retryAfterSeconds: 3 },
    );

    expect(mapped).toMatchObject({
      code: ApiErrorCode.SubjectProjectionNotReady,
      httpStatus: 503,
      message: "主体信息暂未就绪",
      retryAfterSeconds: 3,
    });
    expect(JSON.stringify(mapped)).not.toContain("redis://secret@internal");
  });
});
