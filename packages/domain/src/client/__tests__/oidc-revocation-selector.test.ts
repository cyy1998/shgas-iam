import { describe, expect, test } from "bun:test";
import { createOidcRevocationSelector } from "../oidc-revocation-selector";

describe("OIDC committed configuration revocation selector", () => {
  test("selects only earlier integer generations without interpreting another protocol's version", () => {
    const selector = createOidcRevocationSelector(3);
    expect(selector.metadataFields).toEqual(["oidcConfigVersion"]);
    expect(selector.select({ metadata: { oidcConfigVersion: 2 } })).toBe("select");
    for (const version of [3, 4])
      expect(selector.select({ metadata: { oidcConfigVersion: version } })).toBe("retain");
    for (const version of [undefined, null, "2", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(selector.select({ metadata: { oidcConfigVersion: version, configVersion: 1 } })).toBe("unconfirmed");
    expect(() => createOidcRevocationSelector(Number.NaN)).toThrow(RangeError);
  });
});
