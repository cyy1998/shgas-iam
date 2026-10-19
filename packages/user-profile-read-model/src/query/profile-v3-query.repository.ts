import type { DbClient } from "@iam/db";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { V3_USER_PROFILE_SCHEMA_VERSION } from "../build/profile-v3";
import { compileV3UserProfileFilter } from "./profile-v3-filter";
import { V3_USER_PROFILE_RESULT_LIMIT } from "./profile-v3-query.port";

const V3_USER_PROFILE_RESULT_SENTINEL_LIMIT = V3_USER_PROFILE_RESULT_LIMIT + 1;

export function createV3UserProfileQueryRepository(db: DbClient) {
  return {
    async searchCurrentProfileBases(filter: unknown) {
      const condition = compileV3UserProfileFilter(filter);
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
            eq(userProfiles.profileSchemaVersion, V3_USER_PROFILE_SCHEMA_VERSION),
            eq(userProfiles.isDelete, false),
            condition,
          ),
        )
        .orderBy(asc(userProfiles.userId))
        .limit(V3_USER_PROFILE_RESULT_SENTINEL_LIMIT);
    },
  };
}

export type V3UserProfileQueryRepository = ReturnType<typeof createV3UserProfileQueryRepository>;
