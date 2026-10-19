import type { DbClient } from "@iam/db";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { USER_PROFILE_SCHEMA_VERSION } from "../schema/profile.schema";
import { compileUserProfileFilter } from "./user-profile-filter";
import { USER_PROFILE_RESULT_LIMIT } from "./user-profile-search.port";

const USER_PROFILE_RESULT_SENTINEL_LIMIT = USER_PROFILE_RESULT_LIMIT + 1;

export function createUserProfileSearchRepository(db: DbClient) {
  return {
    async searchCurrentProfileBases(filter: unknown) {
      const condition = compileUserProfileFilter(filter);
      return await db
        .select({
          mobile: userProfiles.mobile,
          name: userProfiles.name,
          searchDocument: userProfiles.searchDoc,
          subjectIdentifier: userProfiles.subjectIdentifier,
          username: userProfiles.username,
          wxId: userProfiles.wxId,
        })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.profileSchemaVersion, USER_PROFILE_SCHEMA_VERSION),
            eq(userProfiles.isDelete, false),
            condition,
          ),
        )
        .orderBy(asc(userProfiles.userId))
        .limit(USER_PROFILE_RESULT_SENTINEL_LIMIT);
    },
  };
}

export type UserProfileSearchRepository = ReturnType<typeof createUserProfileSearchRepository>;
