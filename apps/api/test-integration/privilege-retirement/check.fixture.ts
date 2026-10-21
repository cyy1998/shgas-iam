import { isDeepStrictEqual } from "node:util";

// Protocol responses may contain credentials. Fail with the named requirement only.
export function check(value: unknown, requirement: string): asserts value {
  if (!value) throw new Error(requirement);
}

export function same(actual: unknown, expected: unknown, requirement: string) {
  check(isDeepStrictEqual(actual, expected), requirement);
}

export function requiredText(value: unknown, requirement: string): string {
  check(typeof value === "string" && value.length > 0, requirement);
  return value;
}
