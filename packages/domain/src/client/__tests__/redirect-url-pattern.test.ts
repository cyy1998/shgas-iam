import { describe, expect, test } from "bun:test";
import {
  isRedirectUrlAllowedByPatterns,
  matchRedirectUrlPattern,
  parseRedirectUrlPattern,
  validateRedirectUrlPattern,
} from "../redirect-url-pattern";

describe("redirect URL pattern", () => {
  test("matches exact origins and path subtrees on segment boundaries", () => {
    expect(matchRedirectUrlPattern("https://app.example.com", "https://app.example.com")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foo", "https://app.example.com")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foo", "https://app.example.com/foo")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foo/bar", "https://app.example.com/foo")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/foobar", "https://app.example.com/foo")).toBe(false);
  });

  test("matches only one wildcard host label", () => {
    expect(matchRedirectUrlPattern("https://tenant.example.com/callback", "https://*.example.com/callback")).toBe(true);
    expect(matchRedirectUrlPattern("https://example.com/callback", "https://*.example.com/callback")).toBe(false);
    expect(matchRedirectUrlPattern("https://a.b.example.com/callback", "https://*.example.com/callback")).toBe(false);
  });

  test("matches wildcard path children but not the base path", () => {
    expect(matchRedirectUrlPattern("https://app.example.com/callback/", "https://app.example.com/callback/*")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/callback/a", "https://app.example.com/callback/*")).toBe(true);
    expect(matchRedirectUrlPattern("https://app.example.com/callback", "https://app.example.com/callback/*")).toBe(false);
  });

  test("ignores redirect query and hash while rejecting them in patterns", () => {
    expect(matchRedirectUrlPattern(
      "https://app.example.com/callback?code=1#done",
      "https://app.example.com/callback",
    )).toBe(true);
    expect(validateRedirectUrlPattern("https://app.example.com/callback?x=1").ok).toBe(false);
    expect(validateRedirectUrlPattern("https://app.example.com/callback#x").ok).toBe(false);
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
