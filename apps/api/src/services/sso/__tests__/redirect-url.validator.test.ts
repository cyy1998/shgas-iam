import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSsoRedirectUrlValidator } from "../redirect-url.validator";

const warn = mock(() => undefined);

beforeEach(() => {
  warn.mockClear();
});

describe("createSsoRedirectUrlValidator", () => {
  test("accepts an http redirect matching the configured wildcard and path pattern", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.isAllowed(
      "portal",
      "https://tenant.example.com/app/home",
      ["https://*.example.com/app/*"],
    )).toBe(true);
  });

  test("skips an invalid historical pattern, logs context, and accepts a later match", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.isAllowed(
      "portal",
      "https://app.example.com/foo",
      ["https://*.com/callback", "https://app.example.com/foo"],
      {
        requestContext: {
          sourceApp: "iam",
          requestId: "req-redirect",
          traceId: null,
          ip: null,
          userAgent: null,
          route: null,
          method: null,
        },
      },
    )).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      pattern: "https://*.com/callback",
      requestId: "req-redirect",
    }), "invalid client redirect url pattern");
  });

  test("rejects non-http redirect schemes before pattern matching", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.isAllowed("portal", "javascript:alert(1)", ["javascript:*"])).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
