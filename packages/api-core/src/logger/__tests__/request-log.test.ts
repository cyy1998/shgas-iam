import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import {
  buildApiErrorLogFields,
  buildHttpRequestLogFields,
  getApiErrorLogLevel,
  getClientIpFromHeaders,
  getRequestIdFromHeaders,
  getStatusLogLevel,
  getTraceIdFromHeaders,
  getUserAgentFromHeaders,
  LoggerSourceApp,
  summarizeValidationIssues,
  SystemLogEvent,
} from "../index";

function headerReader(headers: Record<string, string | string[] | undefined>) {
  return (name: string) => headers[name] ?? headers[name.toLowerCase()];
}

describe("request log helpers", () => {
  test("keeps access log levels stable at info", () => {
    expect(getStatusLogLevel(200)).toBe("info");
    expect(getStatusLogLevel(302)).toBe("info");
    expect(getStatusLogLevel(400)).toBe("info");
    expect(getStatusLogLevel(499)).toBe("info");
    expect(getStatusLogLevel(500)).toBe("info");
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

  test("selects actionable API error log levels", () => {
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorUnhandled,
      statusCode: 500,
      path: "/public/boom",
    })).toBe("error");
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorHandled,
      statusCode: 500,
      path: "/public/boom",
    })).toBe("error");
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorHandled,
      statusCode: 403,
      path: "/public/forbidden",
    })).toBe("warn");
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorHandled,
      statusCode: 401,
      path: "/internal/sync",
    })).toBe("warn");
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorHandled,
      statusCode: 401,
      path: "/auth/session",
    })).toBe("info");
    expect(getApiErrorLogLevel({
      event: SystemLogEvent.ApiErrorHandled,
      statusCode: 422,
      path: "/public/items",
    })).toBe("info");
  });

  test("builds API error log fields with diagnostic err rules", () => {
    const error = new Error("boom");
    const known4xx = buildApiErrorLogFields({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      sourceApp: LoggerSourceApp.Api,
      requestId: "req-1",
      statusCode: 404,
      errorCode: ApiErrorCode.OrganizationNotFound,
      errorName: "OrganizationNotFoundError",
      errorMessage: "组织不存在",
      err: error,
    });

    expect(known4xx).toMatchObject({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      sourceApp: LoggerSourceApp.Api,
      requestId: "req-1",
      statusCode: 404,
      errorCode: ApiErrorCode.OrganizationNotFound,
      errorName: "OrganizationNotFoundError",
      errorMessage: "组织不存在",
    });
    expect(known4xx).not.toHaveProperty("err");

    expect(buildApiErrorLogFields({
      event: SystemLogEvent.ApiErrorHandled,
      surface: "rest",
      statusCode: 500,
      errorName: "CustomError",
      errorMessage: "boom",
      err: error,
    })).toMatchObject({ err: error });
    expect(buildApiErrorLogFields({
      event: SystemLogEvent.ApiErrorUnhandled,
      surface: "trpc",
      statusCode: 500,
      errorName: "Error",
      errorMessage: "boom",
      err: error,
    })).toMatchObject({ err: error });
  });

  test("summarizes validation issues without values", () => {
    expect(summarizeValidationIssues([
      { path: ["body", "name"] },
      { path: [] },
      { path: "query.page" },
    ])).toEqual({
      issueCount: 3,
      issuePaths: ["body.name", "<root>", "query.page"],
    });
  });
});
