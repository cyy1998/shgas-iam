import type { DbClient } from "@iam/db";
import type { InternalUserProfileFilterDsl } from "./internal-user-query.schema";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { compileInternalUserProfileFilter } from "./internal-user-query.compiler";
import { INTERNAL_USER_PROFILE_RESULT_LIMIT } from "./internal-user-query.schema";
import { USER_PROFILE_SCHEMA_VERSION } from "./profile.schema";

const RESULT_SENTINEL_LIMIT = INTERNAL_USER_PROFILE_RESULT_LIMIT + 1;

export function createInternalUserProfileQueryRepository(db: DbClient) {
  return {
    async getCurrentByUsername(username: string) {
      const profiles = await db
        .select({ detail: userProfiles.detail })
        .from(userProfiles)
        .where(and(
          eq(userProfiles.username, username),
          eq(
            userProfiles.profileSchemaVersion,
            USER_PROFILE_SCHEMA_VERSION,
          ),
        ))
        .orderBy(asc(userProfiles.userId))
        .limit(1);
      return profiles[0] ?? null;
    },

    async searchCurrentVisibleProfiles(filter: InternalUserProfileFilterDsl) {
      return await db
        .select({ detail: userProfiles.detail })
        .from(userProfiles)
        .where(and(
          eq(
            userProfiles.profileSchemaVersion,
            USER_PROFILE_SCHEMA_VERSION,
          ),
          eq(userProfiles.searchVisible, true),
          compileInternalUserProfileFilter(filter),
        ))
        .orderBy(asc(userProfiles.userId))
        .limit(RESULT_SENTINEL_LIMIT);
    },
  };
}

export type InternalUserProfileQueryRepository = ReturnType<
  typeof createInternalUserProfileQueryRepository
>;
