import type { DbClient } from "@iam/db";
import { USER_PROFILE_SCHEMA_VERSION } from "./profile.schema";

export function createUserProfileQueryRepository(db: DbClient) {
  return {
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

export type UserProfileQueryRepository = ReturnType<typeof createUserProfileQueryRepository>;
