import type { DbClient } from "@iam/db";
import type { OrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { PublishedProfileSchema, parseUserProfileDetailDocument } from "../schema/profile.schema";
import type { PublishedProfileRowInput } from "../schema/profile-storage.schema";
import { createProfileBuildRepository } from "./profile-build.repository";
import { createProfileBuilder } from "./profile-builder.service";
import type { UserProfileEffectiveRoleResolverPort } from "./user-profile-build.repository";

export interface UserProfileBuilderDeps {
  db: DbClient;
  roleAssignmentResolver: UserProfileEffectiveRoleResolverPort;
  responsibilityResolver: Pick<OrganizationResponsibilityResolver, "resolveEffectiveResponsibilities">;
  clock: { nowDate: () => Date };
  config: { batchSize: number };
}

export function createUserProfileBuilder(deps: UserProfileBuilderDeps) {
  return createProfileBuilder({
    buildRepository: createProfileBuildRepository(deps.db, deps.roleAssignmentResolver, deps.responsibilityResolver),
    clock: deps.clock,
    config: deps.config,
  });
}

export type UserProfileBuilder = ReturnType<typeof createUserProfileBuilder>;

export function parseUserProfileRow(row: PublishedProfileRowInput) {
  return PublishedProfileSchema.parse({
    ...row,
    detail: parseUserProfileDetailDocument(row.detail),
  });
}
