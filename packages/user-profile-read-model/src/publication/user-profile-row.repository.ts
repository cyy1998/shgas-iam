import type { DbClient } from "@iam/db";
import type { PublishedProfileRowInput } from "../schema/profile-storage.schema";
import { firstRow } from "@iam/db/query-utils";
import { userProfiles } from "@iam/db/schema";
import { isNull, lte, or } from "drizzle-orm";
import { toUserProfileRow } from "./user-profile-row";

export function createUserProfileRowRepository(db: DbClient) {
  return {
    async upsert(input: PublishedProfileRowInput) {
      const values = toUserProfileRow(input);
      return firstRow(await db
        .insert(userProfiles)
        .values(values)
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            subjectIdentifier: values.subjectIdentifier,
            username: values.username,
            name: values.name,
            mobile: values.mobile,
            wxId: values.wxId,
            status: values.status,
            isDelete: values.isDelete,
            searchVisible: values.searchVisible,
            profileSchemaVersion: values.profileSchemaVersion,
            sourceDirtyVersion: values.sourceDirtyVersion,
            detail: values.detail,
            searchDoc: values.searchDoc,
            subjectFacts: values.subjectFacts,
            rebuiltAt: values.rebuiltAt,
            updateTime: values.rebuiltAt,
          },
          setWhere: or(
            isNull(userProfiles.sourceDirtyVersion),
            lte(userProfiles.sourceDirtyVersion, values.sourceDirtyVersion),
          ),
        })
        .returning()) ?? null;
    },
  };
}
