import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSsoRedirectUrlValidator } from "../redirect-url.validator";

const warn = mock(() => undefined);

beforeEach(() => {
  warn.mockClear();
});

describe("createSsoRedirectUrlValidator", () => {
  test("returns the canonical actual redirect URL that must be bound into the grant", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "HTTPS://APP.Example.COM:443/a/../callback",
      ["https://app.example.com/callback"],
    )).toBe("https://app.example.com/callback");
  });

  test("returns a wildcard-matched redirect URL with its query parameters", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "https://tenant.example.com/app/callback?next=1",
      ["https://*.example.com/app/*"],
    )).toBe("https://tenant.example.com/app/callback?next=1");
  });

  test("rejects query parameters when the path pattern is exact", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "https://app.example.com/app/callback?next=1",
      ["https://app.example.com/app/callback"],
    )).toBeNull();
  });

  test("skips an invalid historical pattern, logs context, and accepts a later match", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });
    const credentialSentinel = "unique-redirect-password-sentinel";
    const invalidPattern
      = `https://user:${credentialSentinel}@invalid.example.com/callback`;

    expect(validator.normalizeAllowed(
      "portal",
      "https://app.example.com/foo",
      [invalidPattern, "https://app.example.com/foo"],
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
    )).toBe("https://app.example.com/foo");
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      patternIndex: 0,
      reason: "url_credentials_not_allowed",
      requestId: "req-redirect",
    }), "invalid client redirect url pattern");
    const observableLog = JSON.stringify(warn.mock.calls);
    expect(observableLog).not.toContain(invalidPattern);
    expect(observableLog).not.toContain(credentialSentinel);
    expect(observableLog).not.toContain("user:");
  });

  test("rejects non-http redirect schemes before pattern matching", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "javascript:alert(1)",
      ["javascript:*"],
    )).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test("does not treat a path-prefix match as a path-segment match", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "https://app.example.com/foobar",
      ["https://app.example.com/foo"],
    )).toBeNull();
  });

  test("does not match a wildcard subdomain pattern against the root domain", () => {
    const validator = createSsoRedirectUrlValidator({ logger: { warn } });

    expect(validator.normalizeAllowed(
      "portal",
      "https://example.com",
      ["https://*.example.com"],
    )).toBeNull();
  });
});
