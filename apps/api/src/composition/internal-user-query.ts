import type { CreateInternalQueryResourceOptions } from "./internal-query-resource";
import { createInternalQueryResource } from "./internal-query-resource";

export const INTERNAL_USER_STATEMENT_TIMEOUT_MS = 2_000;

export type CreateInternalUserQueryResourceOptions = CreateInternalQueryResourceOptions;

export function createInternalUserQueryResource(options: CreateInternalUserQueryResourceOptions) {
  return createInternalQueryResource(options, {
    applicationName: "iam-api-internal-user",
    statementTimeoutMs: INTERNAL_USER_STATEMENT_TIMEOUT_MS,
  });
}
