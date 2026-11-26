import { describe, expect, test } from "bun:test";
import { maskMobileForAudit } from "../masking";

describe("audit masking helpers", () => {
  test("masks mobile numbers for audit details", () => {
    expect(maskMobileForAudit("17721462865")).toBe("177****2865");
  });

  test("passes through non-matching values and keeps nullish values null", () => {
    expect(maskMobileForAudit("bad-phone")).toBe("bad-phone");
    expect(maskMobileForAudit(null)).toBeNull();
    expect(maskMobileForAudit(undefined)).toBeNull();
  });
});
