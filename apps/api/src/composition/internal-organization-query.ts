import type { CreateInternalQueryResourceOptions } from "./internal-query-resource";
import { createInternalQueryResource } from "./internal-query-resource";

export const INTERNAL_ORGANIZATION_STATEMENT_TIMEOUT_MS = 2_000;

export function createInternalOrganizationQueryResource(options: CreateInternalQueryResourceOptions) {
  return createInternalQueryResource(options, {
    applicationName: "iam-api-internal-organization-search",
    statementTimeoutMs: INTERNAL_ORGANIZATION_STATEMENT_TIMEOUT_MS,
  });
}
