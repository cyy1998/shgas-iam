import { describe, expect, test } from "bun:test";
import { booleanString, optionalNonEmptyString } from "../env-schema";

describe("environment value schemas", () => {
  test.each([
    [undefined, true, true],
    [undefined, false, false],
    ["  ", true, true],
    ["  ", false, false],
    ["1", false, true],
    [" TRUE ", false, true],
    ["yes", false, true],
    ["on", false, true],
    ["false", true, false],
    ["0", true, false],
    ["unknown", true, false],
  ])("parses %s with default %s as %s", (value, defaultValue, expected) => {
    expect(booleanString(defaultValue).parse(value)).toBe(expected);
  });

  test("omits absent or blank optional strings and trims configured values", () => {
    const schema = optionalNonEmptyString();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse("  \t ")).toBeUndefined();
    expect(schema.parse("  configured-value  ")).toBe("configured-value");
  });
});
