import type { DbClient } from "@iam/db";
import type { V3UserProfileFilter } from "./profile-v3-filter";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { V3_USER_PROFILE_SCHEMA_VERSION } from "./profile-v3";
import {
  compileV3UserProfileFilter,
} from "./profile-v3-filter";
import {
  V3_USER_PROFILE_RESULT_LIMIT,
} from "./profile-v3-query.port";

const V3_USER_PROFILE_RESULT_SENTINEL_LIMIT = V3_USER_PROFILE_RESULT_LIMIT + 1;

export function createV3UserProfileQueryRepository(db: DbClient) {
  return {
    async searchCurrentProfiles(filter: V3UserProfileFilter) {
      const rows = await db
        .select({
          detail: userProfiles.detail,
          searchDocument: userProfiles.searchDoc,
        })
        .from(userProfiles)
        .where(and(
          eq(userProfiles.profileSchemaVersion, V3_USER_PROFILE_SCHEMA_VERSION),
          eq(userProfiles.isDelete, false),
          compileV3UserProfileFilter(filter),
        ))
        .orderBy(asc(userProfiles.userId))
        .limit(V3_USER_PROFILE_RESULT_SENTINEL_LIMIT);
      return rows;
    },
  };
}

export type V3UserProfileQueryRepository = ReturnType<
  typeof createV3UserProfileQueryRepository
>;
