import { describe, expect, test } from "bun:test";
import { createCustomSsoRevocationSelector } from "../maintenance";

describe("Custom SSO committed configuration revocation selector", () => {
  test("selects only earlier integer generations and skips unknown metadata", () => {
    const selector = createCustomSsoRevocationSelector(8);
    expect(selector.metadataFields).toEqual(["configVersion"]);
    expect(selector.select({ metadata: { configVersion: 7 } })).toBe("select");
    for (const version of [8, 9])
      expect(selector.select({ metadata: { configVersion: version } })).toBe("retain");
    for (const version of [undefined, null, "7", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(selector.select({ metadata: { configVersion: version, oidcConfigVersion: 1 } })).toBe("unconfirmed");
    expect(() => createCustomSsoRevocationSelector(-1)).toThrow(RangeError);
  });
});
