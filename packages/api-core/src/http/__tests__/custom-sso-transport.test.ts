import { describe, expect, test } from "bun:test";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
  encodeCustomSsoClientCode,
  expireCustomSsoCookies,
} from "@iam/api-core/http/custom-sso-transport";
import { Hono } from "hono";

test("round-trips opaque Client codes and rejects malformed percent encoding", () => {
  const clientCode = "legacy:客户端/!%";
  const encoded = "legacy%3A%E5%AE%A2%E6%88%B7%E7%AB%AF%2F%21%25";
  expect(encodeCustomSsoClientCode(clientCode)).toBe(encoded);
  expect(decodeCustomSsoClientCode(encoded)).toBe(clientCode);
  expect(decodeCustomSsoClientCode("%E5%")).toBeNull();
  expect(customSsoLocalSessionCookieName(clientCode)).toBe(`local_${encoded}_session`);
});

test("expires only the named session cookies at the root path", async () => {
  const app = new Hono();
  app.get("/", (c) => {
    expireCustomSsoCookies(c, ["local_gateway_session"]);
    return c.text("done");
  });
  const response = await app.request("/", {
    headers: { Cookie: "global_session=root; local_gateway_session=local" },
  });
  expect(response.headers.getSetCookie()).toEqual([
    "local_gateway_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ]);
});

describe("Custom SSO Client Code transport", () => {
  test.each([
    ["gateway", "gateway"],
    ["_legacy", "_legacy"],
    ["legacy:client", "legacy%3Aclient"],
    ["legacy/client", "legacy%2Fclient"],
    ["中文客户端", "%E4%B8%AD%E6%96%87%E5%AE%A2%E6%88%B7%E7%AB%AF"],
  ])("round-trips %s through the transport segment", (clientCode, encoded) => {
    expect(encodeCustomSsoClientCode(clientCode)).toBe(encoded);
    expect(decodeCustomSsoClientCode(encoded)).toBe(clientCode);
    expect(customSsoLocalSessionCookieName(clientCode)).toBe(`local_${encoded}_session`);
  });

  test("does not alias a literal percent escape with its decoded delimiter", () => {
    expect(encodeCustomSsoClientCode("legacy%3Aclient")).toBe("legacy%253Aclient");
    expect(encodeCustomSsoClientCode("legacy:client")).toBe("legacy%3Aclient");
    expect(decodeCustomSsoClientCode("legacy%253Aclient")).toBe("legacy%3Aclient");
  });

  test("round-trips a database-width non-BMP Client Code", () => {
    const clientCode = "😀".repeat(64);
    const encoded = encodeCustomSsoClientCode(clientCode);

    expect(decodeCustomSsoClientCode(encoded)).toBe(clientCode);
    expect(customSsoLocalSessionCookieName(clientCode)).toBe(`local_${encoded}_session`);
  });

  test.each(["%", "%0", "%GG", "%E4%B8"])("rejects malformed encoded Client Code %s", (encoded) => {
    expect(decodeCustomSsoClientCode(encoded)).toBeNull();
  });
});
