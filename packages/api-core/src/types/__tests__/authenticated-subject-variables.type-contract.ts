import type { AuthenticatedSubjectVariables } from "../lib";

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

const hasOnlyExpectedKeys: HasOnlyExpectedKeys = true;
void hasOnlyExpectedKeys;
