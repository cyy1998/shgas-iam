import type { CreateInternalQueryResourceOptions } from "./internal-query-resource";
import { createInternalQueryResource } from "./internal-query-resource";

export const INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS = 2_000;

export type CreateInternalDelegationQueryResourceOptions
  = CreateInternalQueryResourceOptions;

export function createInternalDelegationQueryResource(
  options: CreateInternalDelegationQueryResourceOptions,
) {
  return createInternalQueryResource(options, {
    applicationName: "iam-api-internal-delegation-resolution",
    statementTimeoutMs: INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS,
  });
}
