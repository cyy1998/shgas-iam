import { describe, expect, test } from "bun:test";
import pino from "pino";
import { SystemLogEvent } from "../../logger";
import createApp from "../create-app";
import { createRouter } from "../create-router";
import { defineConfig } from "../define-config";

function createMemoryLogger(lines: unknown[]) {
  const stream = {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  };
  return pino({ level: "info" }, stream).child({ sourceApp: "iam-api-test" });
}

function createTestApp(lines: unknown[]) {
  const route = createRouter();
  route.get("/ping", c => c.json({ ok: true }));

  return createApp(defineConfig({
    prefix: "",
    openapi: { enabled: false },
    tiers: [{ name: "public", title: "Public API" }],
  }), {
    env: { NODE_ENV: "test" },
    logger: createMemoryLogger(lines),
    routes: { "src/routes/public/ping.index.ts": { default: route } },
    middlewares: {},
  });
}

describe("createApp request logging", () => {
  test("preserves incoming requestId and emits IAM request log fields without headers", async () => {
    const lines: unknown[] = [];
    const app = createTestApp(lines);

    const res = await app.request("http://localhost/public/ping", {
      headers: {
        "X-Request-Id": "req-test-1",
        "Traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
        "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
        "User-Agent": "api-core-test",
        "Authorization": "Bearer should-not-log",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-test-1");
    const log = lines.find((line): line is Record<string, unknown> =>
      typeof line === "object" && line !== null && "event" in line);

    expect(log).toMatchObject({
      event: SystemLogEvent.HttpRequestCompleted,
      sourceApp: "iam-api-test",
      requestId: "req-test-1",
      method: "GET",
      path: "/public/ping",
      route: "/public/ping",
      statusCode: 200,
      traceId: "11111111111111111111111111111111",
      clientIp: "203.0.113.10",
      userAgent: "api-core-test",
      msg: "HTTP request completed",
    });
    expect(log).not.toHaveProperty("req");
    expect(log).not.toHaveProperty("headers");
    expect(typeof log?.durationMs).toBe("number");
  });

  test("generates a response requestId for direct backend access", async () => {
    const lines: unknown[] = [];
    const app = createTestApp(lines);

    const res = await app.request("http://localhost/public/ping");
    const requestId = res.headers.get("x-request-id");
    const log = lines.find((line): line is Record<string, unknown> =>
      typeof line === "object" && line !== null && "event" in line);

    expect(requestId).toBeTruthy();
    expect(log?.requestId).toBe(requestId);
  });
});
