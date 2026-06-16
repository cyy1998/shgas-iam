import { describe, expect, test } from "bun:test";
import {
  buildHttpRequestLogFields,
  getClientIpFromHeaders,
  getRequestIdFromHeaders,
  getStatusLogLevel,
  getTraceIdFromHeaders,
  getUserAgentFromHeaders,
  LoggerSourceApp,
  SystemLogEvent,
} from "../index";

function headerReader(headers: Record<string, string | string[] | undefined>) {
  return (name: string) => headers[name] ?? headers[name.toLowerCase()];
}

describe("request log helpers", () => {
  test("maps status codes to access log levels", () => {
    expect(getStatusLogLevel(200)).toBe("info");
    expect(getStatusLogLevel(302)).toBe("info");
    expect(getStatusLogLevel(400)).toBe("warn");
    expect(getStatusLogLevel(499)).toBe("warn");
    expect(getStatusLogLevel(500)).toBe("error");
  });

  test("extracts trace id by stable priority", () => {
    const readHeader = headerReader({
      "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
      "x-b3-traceid": "33333333333333333333333333333333",
      "x-trace-id": "44444444444444444444444444444444",
    });

    expect(getTraceIdFromHeaders(readHeader)).toBe("11111111111111111111111111111111");
    expect(getTraceIdFromHeaders(headerReader({
      "x-b3-traceid": "33333333333333333333333333333333",
      "x-trace-id": "44444444444444444444444444444444",
    }))).toBe("33333333333333333333333333333333");
    expect(getTraceIdFromHeaders(headerReader({
      "x-trace-id": "44444444444444444444444444444444",
    }))).toBe("44444444444444444444444444444444");
  });

  test("extracts request id, client ip, and user agent with fallbacks", () => {
    expect(getRequestIdFromHeaders(headerReader({ "x-request-id": "req-1" }), () => "fallback")).toBe("req-1");
    expect(getRequestIdFromHeaders(headerReader({}), () => "fallback")).toBe("fallback");
    expect(getClientIpFromHeaders(headerReader({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.20",
    }))).toBe("203.0.113.10");
    expect(getClientIpFromHeaders(headerReader({ "x-real-ip": "198.51.100.20" }))).toBe("198.51.100.20");
    expect(getUserAgentFromHeaders(headerReader({ "user-agent": "api-core-test" }))).toBe("api-core-test");
  });

  test("builds stable HTTP request completed fields", () => {
    const fields = buildHttpRequestLogFields({
      sourceApp: LoggerSourceApp.Api,
      requestId: "req-1",
      readHeader: headerReader({ "user-agent": "api-core-test" }),
      method: "GET",
      path: "/public/ping",
      route: "/public/ping",
      statusCode: 200,
      durationMs: 12,
    });

    expect(fields).toMatchObject({
      event: SystemLogEvent.HttpRequestCompleted,
      sourceApp: LoggerSourceApp.Api,
      requestId: "req-1",
      method: "GET",
      path: "/public/ping",
      route: "/public/ping",
      statusCode: 200,
      durationMs: 12,
      userAgent: "api-core-test",
    });
  });
});
