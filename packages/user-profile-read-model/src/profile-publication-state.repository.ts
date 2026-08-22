import type { DbClient } from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import { userProfiles } from "@iam/db/schema";
import { and, eq, isNull, lte, or } from "drizzle-orm";

export function createProfilePublicationStateRepository(db: DbClient) {
  return {
    async deleteByUserIdAtMostVersion(input: {
      userId: number;
      sourceDirtyVersion: string;
    }) {
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

    async findVersionByUserId(userId: number) {
      return firstRow(await db
        .select({ sourceDirtyVersion: userProfiles.sourceDirtyVersion })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)) ?? null;
    },
  };
}
