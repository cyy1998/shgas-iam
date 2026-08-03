import type { AuthenticatedSubjectVariables } from "../lib";
import { expect, test } from "bun:test";

type ExpectedVariableKey
  = | "authenticatedClientCode"
    | "orcasId"
    | "subjectIdentifier";

type UnexpectedVariableKey = Exclude<
  keyof AuthenticatedSubjectVariables,
  ExpectedVariableKey
>;
type MissingVariableKey = Exclude<
  ExpectedVariableKey,
  keyof AuthenticatedSubjectVariables
>;
type HasOnlyExpectedKeys
  = UnexpectedVariableKey | MissingVariableKey extends never
    ? true
    : never;

test("shared authenticated subject variables stay protocol-neutral", () => {
  const hasOnlyExpectedKeys: HasOnlyExpectedKeys = true;

  expect(hasOnlyExpectedKeys).toBe(true);
});
