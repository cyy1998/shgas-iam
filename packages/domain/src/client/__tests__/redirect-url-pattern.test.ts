import { describe, expect, test } from "bun:test";
import {
  isRedirectUrlAllowedByPatterns,
  matchRedirectUrlPattern,
  normalizeRedirectUrl,
  parseRedirectUrlPattern,
  validateRedirectUrlPattern,
} from "../redirect-url-pattern";

describe("redirect URL pattern", () => {
  test("matches an exact path only when the pattern has no explicit path wildcard", () => {
    expect(matchRedirectUrlPattern("https://app.example.com", "https://app.example.com")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foo", "https://app.example.com")).toBe(false);
    expect(matchRedirectUrlPattern("https://app.example.com/foo", "https://app.example.com/foo")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foo/bar", "https://app.example.com/foo")).toBe(false);
    expect(matchRedirectUrlPattern("https://app.example.com/foobar", "https://app.example.com/foo")).toBe(false);
  });

  test("normalizes an actual redirect URL to the literal value bound into a grant", () => {
    expect(normalizeRedirectUrl("HTTPS://APP.Example.COM:443/a/../callback")).toBe(
      "https://app.example.com/callback",
    );
  });

  test("rejects credentials and fragment in an actual redirect URL", () => {
    for (const redirectUrl of [
      "https://user:password@app.example.com/callback",
      "https://app.example.com/callback#fragment",
    ]) {
      expect(() => normalizeRedirectUrl(redirectUrl)).toThrow();
    }
  });

  test("rejects every raw userinfo form in patterns and actual redirects", () => {
    for (const redirectUrl of [
      "https://@app.example.com/callback",
      "https://:@app.example.com/callback",
      "https://user@app.example.com/callback",
    ]) {
      expect(() => normalizeRedirectUrl(redirectUrl))
        .toThrow("url_credentials_not_allowed");
      expect(validateRedirectUrlPattern(redirectUrl)).toMatchObject({
        ok: false,
        reason: "url_credentials_not_allowed",
      });
    }

    expect(normalizeRedirectUrl("https://app.example.com/users/@me")).toBe(
      "https://app.example.com/users/@me",
    );
  });

  test("preserves an empty query delimiter but still rejects fragment delimiters", () => {
    expect(normalizeRedirectUrl("https://app.example.com/callback?")).toBe(
      "https://app.example.com/callback?",
    );

    for (const redirectUrl of [
      "https://app.example.com/callback#",
      "https://app.example.com/callback?#",
    ]) {
      expect(() => normalizeRedirectUrl(redirectUrl)).toThrow("query_or_fragment_not_allowed");
      expect(() => matchRedirectUrlPattern(
        redirectUrl,
        "https://app.example.com/callback",
      )).toThrow("query_or_fragment_not_allowed");
    }
  });

  test("matches only one wildcard host label", () => {
    expect(matchRedirectUrlPattern("https://tenant.example.com/callback", "https://*.example.com/callback")).toBe(true);
    expect(matchRedirectUrlPattern("https://example.com/callback", "https://*.example.com/callback")).toBe(false);
    expect(matchRedirectUrlPattern("https://a.b.example.com/callback", "https://*.example.com/callback")).toBe(false);
  });

  test("allows one wildcard label before any legal fixed registrable-domain suffix", () => {
    expect(
      matchRedirectUrlPattern(
        "https://tenant.login.example.com/callback",
        "https://*.login.example.com/callback",
      ),
    ).toBe(true);
    expect(
      matchRedirectUrlPattern(
        "https://a.b.login.example.com/callback",
        "https://*.login.example.com/callback",
      ),
    ).toBe(false);
    expect(validateRedirectUrlPattern("https://*.github.io/callback").ok).toBe(false);
  });

  test("matches wildcard path children but not the base path", () => {
    expect(matchRedirectUrlPattern("https://app.example.com/callback/", "https://app.example.com/callback/*")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/callback/a", "https://app.example.com/callback/*")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/callback", "https://app.example.com/callback/*")).toBe(false);
  });

  test("allows query parameters only when a wildcard pattern matches", () => {
    expect(matchRedirectUrlPattern(
      "https://app.example.com/callback/complete?returnUrl=%2Fdashboard&tab=profile",
      "https://app.example.com/callback/*",
    )).toBe(true);
    expect(matchRedirectUrlPattern(
      "https://app.example.com/callback/complete?returnUrl=%2Fdashboard",
      "https://app.example.com/callback/complete",
    )).toBe(false);
    expect(matchRedirectUrlPattern(
      "https://tenant.example.com/callback?returnUrl=%2Fdashboard",
      "https://*.example.com/callback",
    )).toBe(true);
    expect(matchRedirectUrlPattern(
      "https://app.example.com/callback?",
      "https://app.example.com/callback",
    )).toBe(false);
  });

  test("rejects query and fragment in patterns", () => {
    expect(validateRedirectUrlPattern("https://app.example.com/callback?x=1").ok).toBe(false);
    expect(validateRedirectUrlPattern("https://app.example.com/callback#x").ok).toBe(false);
  });

  test("rejects empty query and fragment delimiters in patterns", () => {
    for (const pattern of [
      "https://app.example.com/callback?",
      "https://app.example.com/callback#",
      "https://app.example.com/callback?#",
    ]) {
      expect(validateRedirectUrlPattern(pattern)).toMatchObject({
        ok: false,
        reason: "query_or_fragment_not_allowed",
      });
    }
  });

  test("requires protocol host and port to match after URL normalization", () => {
    expect(matchRedirectUrlPattern("http://app.example.com/callback", "http://app.example.com/callback")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/callback", "http://app.example.com/callback")).toBe(false);
    expect(matchRedirectUrlPattern("https://app.example.com:443/callback", "https://app.example.com/callback")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com:8443/callback", "https://app.example.com/callback")).toBe(false);
  });

  test("uses URL parser normalization for IDN and IPv6", () => {
    expect(matchRedirectUrlPattern("https://例子.测试/入口", "https://xn--fsqu00a.xn--0zwm56d/入口")).toBe(true);
    expect(matchRedirectUrlPattern("http://[::1]:8080/callback", "http://[::1]:8080/callback")).toBe(true);
  });

  test("rejects unsupported pattern syntax", () => {
    const invalidPatterns = [
      "",
      "*",
      "ftp://app.example.com/callback",
      "https://*",
      "https://*.com/callback",
      "https://*.co.uk/callback",
      "https://user:password@app.example.com/callback",
      "https://foo.*.example.com/callback",
      "https://app.example.com/foo*",
      "https://app.example.com/*/callback",
      "https://app.example.com/callback?x=1",
      "https://app.example.com/callback#x",
      "https://app.example.com:*",
    ];

    for (const pattern of invalidPatterns) {
      expect(validateRedirectUrlPattern(pattern).ok).toBe(false);
    }
  });

  test("exposes parsed pattern shape and array matcher", () => {
    expect(parseRedirectUrlPattern("https://*.example.com/app/*")).toMatchObject({
      protocol: "https:",
      hostWildcardSuffix: "example.com",
      pathMode: "wildcard-subtree",
      pathname: "/app/",
    });
    expect(isRedirectUrlAllowedByPatterns("https://tenant.example.com/app/home", [
      "https://app.example.com",
      "https://*.example.com/app/*",
    ])).toBe(true);
  });
});
