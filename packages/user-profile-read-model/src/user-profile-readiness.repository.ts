import type { DbClient } from "@iam/db";
import type { PublishedProfileRowInput } from "./profile-storage.schema";
import type { UserProfileProjectionBundle } from "./user-profile-projection";
import type {
  UserProfileReadinessPageRow,
  UserProfileReadinessProjection,
} from "./user-profile-readiness";
import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { userProfileDirty, userProfiles, users } from "@iam/db/schema";
import {
  asc,
  eq,
  gt,
  sql,
} from "drizzle-orm";

export function createUserProfileReadinessRepository<
  TProfile extends PublishedProfileRowInput & UserProfileReadinessProjection,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(
  db: DbClient,
  options: {
    projection: UserProfileProjectionBundle<TProfile, TFactsRecord>;
    buildBatchSize: number;
  },
) {
  async function scanPage(input: {
    afterUserId: number;
    limit: number;
  }): Promise<Array<UserProfileReadinessPageRow<TProfile>>> {
    const rows = await selectProfileRows(db)
      .where(gt(users.id, input.afterUserId))
      .orderBy(asc(users.id))
      .limit(input.limit);
    return rows.map(row => toPageRow(row, options.projection));
  }

  async function readVerificationSummary() {
    const summaries = await db.execute<{
      userCount: number;
      profileCount: number;
      profileSubjectCount: number;
      distinctProfileSubjectCount: number;
      orphanProfileCount: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${users}) AS "userCount",
        (SELECT COUNT(*)::int FROM ${userProfiles}) AS "profileCount",
        (
          SELECT COUNT(${userProfiles.subjectIdentifier})::int
          FROM ${userProfiles}
        ) AS "profileSubjectCount",
        (
          SELECT COUNT(DISTINCT ${userProfiles.subjectIdentifier})::int
          FROM ${userProfiles}
        ) AS "distinctProfileSubjectCount",
        (
          SELECT COUNT(*)::int
          FROM ${userProfiles}
          LEFT JOIN ${users} ON ${users.id} = ${userProfiles.userId}
          WHERE ${users.id} IS NULL
        ) AS "orphanProfileCount"
    `);
    const summary = summaries[0];
    if (summary === undefined)
      throw new Error("User Profile readiness summary is incomplete");
    return summary;
  }

  async function rebuildExpected(
    profiles: TProfile[],
    observedAt: Date,
  ) {
    if (profiles.length === 0)
      return [];
    const builder = options.projection.createBuilder({
      db,
      clock: { nowDate: () => observedAt },
      batchSize: options.buildBatchSize,
    });
    return await builder.buildMany(profiles.map(profile => ({
      userId: profile.userId,
      sourceDirtyVersion: profile.sourceDirtyVersion,
    })));
  }

  return {
    rebuildExpected,
    readVerificationSummary,
    scanPage,
  };
}

type ProfileRow = Awaited<ReturnType<typeof selectProfileRows>>[number];

function selectProfileRows(db: DbClient) {
  return db
    .select({
      userId: users.id,
      userSubjectIdentifier: users.subjectIdentifier,
      userStatus: users.status,
      userDeleted: users.isDelete,
      profileUserId: userProfiles.userId,
      profileSubjectIdentifier: userProfiles.subjectIdentifier,
      username: userProfiles.username,
      name: userProfiles.name,
      mobile: userProfiles.mobile,
      wxId: userProfiles.wxId,
      profileStatus: userProfiles.status,
      profileDeleted: userProfiles.isDelete,
      searchVisible: userProfiles.searchVisible,
      profileSchemaVersion: userProfiles.profileSchemaVersion,
      sourceDirtyVersion: userProfiles.sourceDirtyVersion,
      detail: userProfiles.detail,
      searchDoc: userProfiles.searchDoc,
      subjectFacts: userProfiles.subjectFacts,
      rebuiltAt: userProfiles.rebuiltAt,
      dirtyVersion: userProfileDirty.dirtyVersion,
      dirtyReasonCodes: userProfileDirty.reasonCodes,
      dirtyStatus: userProfileDirty.status,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(userProfileDirty, eq(userProfileDirty.userId, users.id));
}

function toPageRow<
  TProfile extends PublishedProfileRowInput & UserProfileReadinessProjection,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(
  row: ProfileRow,
  projection: UserProfileProjectionBundle<TProfile, TFactsRecord>,
): UserProfileReadinessPageRow<TProfile> {
  const accountAvailable = row.userStatus === UserStatus.Enable && !row.userDeleted;
  if (row.profileUserId === null)
    return issueRow(row, accountAvailable, "profile-missing");
  if (
    row.profileUserId !== row.userId
    || row.profileSubjectIdentifier !== row.userSubjectIdentifier
    || row.profileStatus !== row.userStatus
    || row.profileDeleted !== row.userDeleted
  ) {
    return issueRow(row, accountAvailable, "profile-identity-mismatch");
  }
  if (row.profileSchemaVersion !== projection.schemaVersion)
    return issueRow(row, accountAvailable, "profile-version-mismatch");

  let currentProfile: TProfile;
  try {
    currentProfile = projection.parseProfileRow(toProfileRowInput(row));
  }
  catch {
    return issueRow(row, accountAvailable, "profile-invalid");
  }
  if (
    row.dirtyStatus !== UserProfileDirtyStatus.Processed
    || row.dirtyVersion !== currentProfile.sourceDirtyVersion
  ) {
    return issueRow(row, accountAvailable, "profile-not-current");
  }
  const backfillCompleted
    = row.dirtyReasonCodes?.includes(UserProfileDirtyReason.Backfill) ?? false;
  return {
    userId: row.userId,
    subjectIdentifier: row.userSubjectIdentifier,
    accountAvailable,
    currentProfile,
    backfillCompleted,
    profileIssue: backfillCompleted ? null : "profile-backfill-marker-missing",
  };
}

function toProfileRowInput(row: ProfileRow): PublishedProfileRowInput {
  if (
    row.profileUserId === null
    || row.profileSubjectIdentifier === null
    || row.username === null
    || row.name === null
    || row.profileStatus === null
    || row.profileDeleted === null
    || row.searchVisible === null
    || row.profileSchemaVersion === null
    || row.sourceDirtyVersion === null
    || row.rebuiltAt === null
  ) {
    throw new Error("User Profile row is incomplete");
  }
  return {
    userId: row.profileUserId,
    subjectIdentifier: row.profileSubjectIdentifier,
    username: row.username,
    name: row.name,
    mobile: row.mobile,
    wxId: row.wxId,
    status: row.profileStatus,
    isDelete: row.profileDeleted,
    searchVisible: row.searchVisible,
    profileSchemaVersion: row.profileSchemaVersion,
    sourceDirtyVersion: row.sourceDirtyVersion,
    detail: row.detail,
    searchDoc: row.searchDoc,
    subjectFacts: row.subjectFacts,
    rebuiltAt: row.rebuiltAt,
  };
}

function issueRow(
  row: Pick<ProfileRow, "userId" | "userSubjectIdentifier">,
  accountAvailable: boolean,
  profileIssue: string,
): UserProfileReadinessPageRow<never> {
  return {
    userId: row.userId,
    subjectIdentifier: row.userSubjectIdentifier,
    accountAvailable,
    currentProfile: null,
    backfillCompleted: false,
    profileIssue,
  };
}
