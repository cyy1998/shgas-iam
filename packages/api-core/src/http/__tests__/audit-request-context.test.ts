import { expect, test } from "bun:test";
import { getAuditRequestContext } from "@iam/api-core/http/audit-request-context";
import type { BaseBindings } from "@iam/api-core/types";
import { Hono } from "hono";

test("extracts plain audit metadata without query strings or credential headers", async () => {
  const app = new Hono<BaseBindings>();
  app.post("/account", (c) => {
    c.set("requestId", "assigned-request");
    return c.json(getAuditRequestContext(c, "auth-api"));
  });
  const response = await app.request("/account?token=secret", {
    method: "POST",
    headers: {
      Authorization: "secret",
      Cookie: "global_session=secret",
      "X-Request-Id": "forwarded-request",
      "X-Forwarded-For": "192.0.2.1, 192.0.2.2",
      "X-Real-IP": "192.0.2.3",
      "User-Agent": "audit-fixture",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    },
  });
  const body = await response.json();

  expect(body).toEqual({
    sourceApp: "auth-api",
    requestId: "assigned-request",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    ip: "192.0.2.1",
    userAgent: "audit-fixture",
    route: "/account",
    method: "POST",
  });
});

test("falls back to the request ID header and preserves missing metadata", async () => {
  const app = new Hono();
  app.get("/", (c) => c.json(getAuditRequestContext(c, "integration-api")));
  const response = await app.request("/", { headers: { "X-Request-Id": "forwarded-request" } });
  const body = await response.json();
  expect(body).toEqual({
    sourceApp: "integration-api",
    requestId: "forwarded-request",
    traceId: null,
    ip: null,
    userAgent: null,
    route: "/",
    method: "GET",
  });
});
