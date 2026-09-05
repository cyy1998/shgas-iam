import type { DbClient } from "@iam/db";
import type { PublishedUserProfile } from "../schema/user-profile.schema";
import { firstRow } from "@iam/db/query-utils";
import { userProfiles } from "@iam/db/schema";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { USER_PROFILE_SCHEMA_VERSION } from "../schema/profile.schema";
import { PublishedUserProfileSchema } from "../schema/user-profile.schema";
import { createUserProfileRowRepository } from "./user-profile-row.repository";

export type UserProfileUpsertInput = PublishedUserProfile;

export function createLegacyV1UserProfileRepository(db: DbClient) {
  const rowRepository = createUserProfileRowRepository(db);
  return {
    async upsertProfile(input: UserProfileUpsertInput) {
      return await rowRepository.upsert(PublishedUserProfileSchema.parse(input));
    },

    async deleteByUserId(userId: number) {
      return firstRow(await db
        .delete(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .returning()) ?? null;
    },

    async deleteByUserIdAtMostVersion(input: { userId: number; sourceDirtyVersion: string }) {
      return firstRow(await db
        .delete(userProfiles)
        .where(and(
          eq(userProfiles.userId, input.userId),
          or(
            isNull(userProfiles.sourceDirtyVersion),
            lte(userProfiles.sourceDirtyVersion, input.sourceDirtyVersion),
          ),
        ))
        .returning()) ?? null;
    },

    async getAnyByUserId(userId: number) {
      return await db.query.userProfiles.findFirst({ where: { userId } }) ?? null;
    },

    async getCurrentByUserId(userId: number) {
      return await db.query.userProfiles.findFirst({
        where: { userId, profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION },
      }) ?? null;
    },

    async getCurrentByUsername(username: string) {
      return await db.query.userProfiles.findFirst({
        where: { username, profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION },
      }) ?? null;
    },

    async getCurrentByMobile(mobile: string) {
      return await db.query.userProfiles.findFirst({
        where: { mobile, profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION },
      }) ?? null;
    },

    async getCurrentByWxId(wxId: string) {
      return await db.query.userProfiles.findFirst({
        where: { wxId, profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION },
      }) ?? null;
    },
  };
}

export type LegacyV1UserProfileRepository = ReturnType<
  typeof createLegacyV1UserProfileRepository
>;
