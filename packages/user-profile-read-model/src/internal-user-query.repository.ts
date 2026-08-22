import type { DbClient } from "@iam/db";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { USER_PROFILE_SCHEMA_VERSION } from "./profile.schema";

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
  };
}

export type InternalUserProfileQueryRepository = ReturnType<
  typeof createInternalUserProfileQueryRepository
>;
