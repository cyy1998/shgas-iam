import { describe, expect, test } from "bun:test";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { ApiErrorCode } from "@iam/contracts";
import { SubjectAccessDisabledError, SubjectAccessUnavailableError } from "@iam/subject-access";
import { Hono } from "hono";

function createLoggerCapture() {
  const entries: unknown[] = [];
  const write = (fields: unknown, message?: string) => {
    entries.push({ fields, message });
  };
  return {
    entries,
    logger: {
      bindings: () => ({ sourceApp: "subject-access-http-test" }),
      error: write,
      info: write,
      warn: write,
    },
  };
}

describe("Subject Access HTTP Adapter", () => {
  test("maps disabled to SESSION_INVALID and expires only configured cookies at Path=/", async () => {
    const adapter = createSubjectAccessHttpAdapter();
    const { logger } = createLoggerCapture();
    const app = new Hono();
    app.get(
      "/session",
      async (context) =>
        await adapter.run(
          context,
          {
            clearCookiesOnInvalidSession: ["global_session", "local_alpha_session"],
          },
          async () => {
            throw new SubjectAccessDisabledError();
          },
        ),
    );
    app.onError(createErrorHandler(logger));

    const response = await app.request("/session", {
      headers: {
        Cookie: "global_session=principal-token; local_alpha_session=local-token; unrelated=retain",
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      code: ApiErrorCode.SessionInvalid,
    });
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.some((cookie) => cookie.startsWith("global_session="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("local_alpha_session="))).toBe(true);
    for (const cookie of cookies) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu);
    }
  });

  test("maps unavailable to a sanitized 503 without expiring cookies or logging its cause", async () => {
    const adapter = createSubjectAccessHttpAdapter();
    const { logger, entries } = createLoggerCapture();
    const app = new Hono();
    app.get(
      "/session",
      async (context) =>
        await adapter.run(
          context,
          {
            clearCookiesOnInvalidSession: ["global_session"],
            retryAfterSeconds: 3,
          },
          async () => {
            throw new SubjectAccessUnavailableError(new Error("redis://secret@internal"));
          },
        ),
    );
    app.onError(createErrorHandler(logger));

    const response = await app.request("/session", {
      headers: { Cookie: "global_session=principal-token" },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    const body = await response.json();
    expect(body).toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(JSON.stringify(entries)).not.toContain("redis://secret@internal");
  });
});
