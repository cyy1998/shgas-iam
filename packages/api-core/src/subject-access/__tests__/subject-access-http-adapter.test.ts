import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createErrorHandler } from "../../middlewares";
import {
  createSubjectAccessHttpAdapter,
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "../index";

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
    app.get("/session", async context => await adapter.run(context, {
      clearCookiesOnInvalidSession: ["global_session", "orcas_sso_sessionid"],
    }, async () => {
      throw new SubjectAccessSessionInvalidHttpError();
    }));
    app.onError(createErrorHandler(logger as never));

    const response = await app.request("/session", {
      headers: {
        Cookie: "global_session=principal-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SessionInvalid,
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu);
    }
  });

  test("maps unavailable to a sanitized 503 without expiring cookies or logging its cause", async () => {
    const adapter = createSubjectAccessHttpAdapter();
    const { logger, entries } = createLoggerCapture();
    const app = new Hono();
    app.get("/session", async context => await adapter.run(context, {
      clearCookiesOnInvalidSession: ["global_session"],
      retryAfterSeconds: 3,
    }, async () => {
      throw new SubjectAccessUnavailableError(new Error("redis://secret@internal"));
    }));
    app.onError(createErrorHandler(logger as never));

    const response = await app.request("/session", {
      headers: { Cookie: "global_session=principal-token" },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(JSON.stringify(entries)).not.toContain("redis://secret@internal");
  });
});
