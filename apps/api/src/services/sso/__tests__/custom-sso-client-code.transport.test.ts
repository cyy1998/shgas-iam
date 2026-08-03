import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
  encodeCustomSsoClientCode,
} from "@api/services/sso/custom-sso-client-code.transport";
import { describe, expect, test } from "bun:test";

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
    expect(customSsoLocalSessionCookieName(clientCode)).toBe(
      `local_${encoded}_session`,
    );
  });

  test("does not alias a literal percent escape with its decoded delimiter", () => {
    expect(encodeCustomSsoClientCode("legacy%3Aclient")).toBe(
      "legacy%253Aclient",
    );
    expect(encodeCustomSsoClientCode("legacy:client")).toBe(
      "legacy%3Aclient",
    );
    expect(decodeCustomSsoClientCode("legacy%253Aclient")).toBe(
      "legacy%3Aclient",
    );
  });

  test("round-trips a database-width non-BMP Client Code", () => {
    const clientCode = "😀".repeat(64);
    const encoded = encodeCustomSsoClientCode(clientCode);

    expect(decodeCustomSsoClientCode(encoded)).toBe(clientCode);
    expect(customSsoLocalSessionCookieName(clientCode)).toBe(
      `local_${encoded}_session`,
    );
  });

  test.each(["%", "%0", "%GG", "%E4%B8"])(
    "rejects malformed encoded Client Code %s",
    (encoded) => {
      expect(decodeCustomSsoClientCode(encoded)).toBeNull();
    },
  );
});
