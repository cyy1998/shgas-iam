import type { DbClient } from "@iam/db";
import type { SelectedFields } from "drizzle-orm/pg-core";
import type { V3UserProfileFilter } from "./profile-v3-filter";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { V3_USER_PROFILE_SCHEMA_VERSION } from "../build/profile-v3";
import {
  compileV3UserProfileFilter,
} from "./profile-v3-filter";
import {
  V3_USER_PROFILE_RESULT_LIMIT,
} from "./profile-v3-query.port";

const V3_USER_PROFILE_RESULT_SENTINEL_LIMIT = V3_USER_PROFILE_RESULT_LIMIT + 1;

export function createV3UserProfileQueryRepository(db: DbClient) {
  async function searchCurrent<Selection extends SelectedFields>(
    selection: Selection,
    filter: V3UserProfileFilter,
  ) {
    return await db
      .select(selection)
      .from(userProfiles)
      .$dynamic()
      .where(and(
        eq(userProfiles.profileSchemaVersion, V3_USER_PROFILE_SCHEMA_VERSION),
        eq(userProfiles.isDelete, false),
        compileV3UserProfileFilter(filter),
      ))
      .orderBy(asc(userProfiles.userId))
      .limit(V3_USER_PROFILE_RESULT_SENTINEL_LIMIT);
  }

  return {
    async searchCurrentProfileBases(filter: V3UserProfileFilter) {
      return await searchCurrent({
        mobile: userProfiles.mobile,
        name: userProfiles.name,
        searchDocument: userProfiles.searchDoc,
        subjectIdentifier: userProfiles.subjectIdentifier,
        username: userProfiles.username,
        wxId: userProfiles.wxId,
      }, filter);
    },
    async searchCurrentProfiles(filter: V3UserProfileFilter) {
      return await searchCurrent({
        detail: userProfiles.detail,
        searchDocument: userProfiles.searchDoc,
      }, filter);
    },
  };
}

export type V3UserProfileQueryRepository = ReturnType<
  typeof createV3UserProfileQueryRepository
>;
