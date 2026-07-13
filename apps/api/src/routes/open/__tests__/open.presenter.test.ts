import { expect, test } from "bun:test";
import { maskMobile } from "../open.presenter";

test("masks a normal mobile for open-route presentation", () => {
  expect(maskMobile("17721462865")).toBe("177****2865");
});

test("keeps only the final two characters of a short mobile visible", () => {
  expect(maskMobile("1234567")).toBe("*****67");
});

test("preserves a missing mobile as null", () => {
  expect(maskMobile(null)).toBeNull();
});
