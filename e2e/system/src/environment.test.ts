import { afterEach, describe, expect, test } from "bun:test";
import { requireEnvironment } from "./environment.ts";

const testEnvironmentName = "IAM_E2E_REQUIRED_ENVIRONMENT_TEST_VALUE";
const originalValue = process.env[testEnvironmentName];

afterEach(() => {
  if (originalValue === undefined)
    delete process.env[testEnvironmentName];
  else
    process.env[testEnvironmentName] = originalValue;
});

describe("required E2E environment value", () => {
  test("returns the original non-empty value", () => {
    process.env[testEnvironmentName] = "  configured value  ";

    expect(requireEnvironment(testEnvironmentName))
      .toBe("  configured value  ");
  });

  test("rejects missing and whitespace-only values with the existing message", () => {
    delete process.env[testEnvironmentName];
    expect(() => requireEnvironment(testEnvironmentName))
      .toThrow(`${testEnvironmentName} is required`);

    process.env[testEnvironmentName] = " \t ";
    expect(() => requireEnvironment(testEnvironmentName))
      .toThrow(`${testEnvironmentName} is required`);
  });
});
