import type { DbClient } from "@iam/db";
import type { OrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { PublishedUserDocumentSchema } from "../document";
import { createDocumentBuildRepository } from "./document-build.repository";
import { createDocumentBuilder } from "./document-builder.service";
import type { UserDocumentEffectiveRoleResolverPort } from "./user-document-build.repository";

export interface UserDocumentBuilderDeps {
  db: DbClient;
  roleAssignmentResolver: UserDocumentEffectiveRoleResolverPort;
  responsibilityResolver: Pick<OrganizationResponsibilityResolver, "resolveEffectiveResponsibilities">;
  clock: { nowDate: () => Date };
  config: { batchSize: number };
  signal?: AbortSignal;
}

export function createUserDocumentBuilder(deps: UserDocumentBuilderDeps) {
  return createDocumentBuilder({
    buildRepository: createDocumentBuildRepository(deps.db, deps.roleAssignmentResolver, deps.responsibilityResolver),
    clock: deps.clock,
    config: deps.config,
    signal: deps.signal,
  });
}

export type UserDocumentBuilder = ReturnType<typeof createUserDocumentBuilder>;

export function parseUserDocumentRow(row: unknown) {
  return PublishedUserDocumentSchema.parse(row);
}
