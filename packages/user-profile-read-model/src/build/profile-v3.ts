import type { DbClient } from "@iam/db";
import type { OrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import type { PublishedProfileRowInput } from "../schema/profile-storage.schema";
import type { PublishedProfile } from "../schema/profile.schema";
import type { SubjectFactsCacheRecord } from "../subject-facts/profile-cache";
import type { UserProfileEffectiveRoleResolverPort } from "./user-profile-build.repository";
import {
  parseUserProfileDetailDocument,
  PublishedProfileSchema,
  USER_PROFILE_SCHEMA_VERSION,
} from "../schema/profile.schema";
import { SubjectFactsCacheRecordSchema } from "../subject-facts/profile-cache";
import { createProfileBuildRepository } from "./profile-build.repository";
import { createProfileBuilder } from "./profile-builder.service";

export const V3_USER_PROFILE_SCHEMA_VERSION = USER_PROFILE_SCHEMA_VERSION;

export const V3UserProfileSchema = PublishedProfileSchema;

export type V3UserProfile = PublishedProfile;

export const V3SubjectFactsCacheRecordSchema = SubjectFactsCacheRecordSchema;

export type V3SubjectFactsCacheRecord = SubjectFactsCacheRecord;

export interface V3UserProfileBuilderDeps {
  db: DbClient;
  roleAssignmentResolver: UserProfileEffectiveRoleResolverPort;
  responsibilityResolver: Pick<
    OrganizationResponsibilityResolver,
    "resolveEffectiveResponsibilities"
  >;
  clock: { nowDate: () => Date };
  config: { batchSize: number };
}

export function createV3UserProfileBuilder(
  deps: V3UserProfileBuilderDeps,
) {
  return createProfileBuilder({
    buildRepository: createProfileBuildRepository(
      deps.db,
      deps.roleAssignmentResolver,
      deps.responsibilityResolver,
    ),
    clock: deps.clock,
    config: deps.config,
  });
}

export type V3UserProfileBuilder = ReturnType<
  typeof createV3UserProfileBuilder
>;

export function parseV3UserProfileRow(
  row: PublishedProfileRowInput,
) {
  return V3UserProfileSchema.parse({
    ...row,
    detail: parseUserProfileDetailDocument(row.detail),
  });
}
