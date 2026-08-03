import type { UserProfileDirtyReason } from "@iam/contracts";
import type { db as database } from "@iam/db";
import type {
  SubjectProjectionCutoverBuildTarget,
  SubjectProjectionCutoverPageRow,
} from "./subject-projection-cutover-backfill";
import type { PublishedUserProfile } from "./user-profile.schema";
import {
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { userProfileDirty, userProfiles, users } from "@iam/db/schema";
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { toUserProfileRow } from "./user-profile-row";
import {
  CURRENT_USER_PROFILE_SCHEMA_VERSION,
  parseUserProfileDetailDocument,
  PublishedUserProfileSchema,
} from "./user-profile.schema";

export function createSubjectProjectionCutoverRepository(db: typeof database) {
  async function readVerificationSummary() {
    const [userSummary, profileSummary, orphanSummary] = await Promise.all([
      db.select({ userCount: count() }).from(users),
      db.select({
        profileCount: count(),
        profileSubjectCount: count(userProfiles.subjectIdentifier),
        distinctProfileSubjectCount: countDistinct(userProfiles.subjectIdentifier),
      }).from(userProfiles),
      db.select({ orphanProfileCount: count() })
        .from(userProfiles)
        .leftJoin(users, eq(users.id, userProfiles.userId))
        .where(isNull(users.id)),
    ]);
    const usersRow = userSummary[0];
    const profilesRow = profileSummary[0];
    const orphansRow = orphanSummary[0];
    if (usersRow === undefined || profilesRow === undefined || orphansRow === undefined)
      throw new Error("Subject Projection verification summary is incomplete");
    return {
      userCount: usersRow.userCount,
      profileCount: profilesRow.profileCount,
      profileSubjectCount: profilesRow.profileSubjectCount,
      distinctProfileSubjectCount: profilesRow.distinctProfileSubjectCount,
      orphanProfileCount: orphansRow.orphanProfileCount,
    };
  }

  async function scanPage(input: {
    afterUserId: number;
    limit: number;
  }): Promise<SubjectProjectionCutoverPageRow[]> {
    const rows = await db
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
        profileCreateTime: userProfiles.createTime,
        profileUpdateTime: userProfiles.updateTime,
        dirtyVersion: userProfileDirty.dirtyVersion,
        dirtyStatus: userProfileDirty.status,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(userProfileDirty, eq(userProfileDirty.userId, users.id))
      .where(gt(users.id, input.afterUserId))
      .orderBy(asc(users.id))
      .limit(input.limit);

    return rows.map(row => ({
      userId: row.userId,
      subjectIdentifier: row.userSubjectIdentifier,
      accountAvailable: row.userStatus === UserStatus.Enable && !row.userDeleted,
      currentProfile: parseCurrentProfile(row),
    }));
  }

  async function prepareBatch(
    userIds: number[],
    preparedAt: Date,
  ): Promise<SubjectProjectionCutoverBuildTarget[]> {
    if (userIds.length === 0)
      return [];
    const uniqueUserIds = [...new Set(userIds)];
    const reasonCodes: UserProfileDirtyReason[] = [UserProfileDirtyReasonValue.Backfill];
    const reusableBackfill = sql<boolean>`(
      ${userProfileDirty.reasonCodes} @> '["backfill"]'::jsonb
      AND ${userProfileDirty.status} IN (
        ${UserProfileDirtyStatus.Pending},
        ${UserProfileDirtyStatus.Processing},
        ${UserProfileDirtyStatus.Failed}
      )
    )`;
    const nextVersion = sql<string>`CASE
      WHEN ${reusableBackfill} THEN ${userProfileDirty.dirtyVersion}
      ELSE ${userProfileDirty.dirtyVersion} + 1
    END`;
    const rows = await db
      .insert(userProfileDirty)
      .values(uniqueUserIds.map(userId => ({
        userId,
        dirtyVersion: "1",
        status: UserProfileDirtyStatus.Processing,
        reasonCodes,
        dirtyAt: preparedAt,
        processingStartedAt: preparedAt,
        processedAt: null,
        attempts: 0,
        lastError: null,
        lastJobId: null,
        updateTime: preparedAt,
      })))
      .onConflictDoUpdate({
        target: userProfileDirty.userId,
        set: {
          dirtyVersion: nextVersion,
          status: UserProfileDirtyStatus.Processing,
          reasonCodes,
          dirtyAt: preparedAt,
          processingStartedAt: preparedAt,
          processedAt: null,
          attempts: 0,
          lastError: null,
          lastJobId: null,
          updateTime: preparedAt,
        },
      })
      .returning({
        userId: userProfileDirty.userId,
        sourceDirtyVersion: userProfileDirty.dirtyVersion,
      });
    return rows.sort((left, right) => left.userId - right.userId);
  }

  async function publishBatch(
    inputProfiles: PublishedUserProfile[],
    processedAt: Date,
  ) {
    if (inputProfiles.length === 0)
      return { published: 0 };
    const profiles = inputProfiles.map(profile => PublishedUserProfileSchema.parse(profile));
    const userIds = profiles.map(profile => profile.userId);
    return await db.transaction(async (tx) => {
      const dirtyRows = await tx
        .select({
          userId: userProfileDirty.userId,
          dirtyVersion: userProfileDirty.dirtyVersion,
          status: userProfileDirty.status,
        })
        .from(userProfileDirty)
        .where(inArray(userProfileDirty.userId, userIds))
        .orderBy(asc(userProfileDirty.userId))
        .for("update");
      const expectedVersionByUserId = new Map(
        profiles.map(profile => [profile.userId, profile.sourceDirtyVersion]),
      );
      if (
        dirtyRows.length !== profiles.length
        || dirtyRows.some(row =>
          row.status !== UserProfileDirtyStatus.Processing
          || expectedVersionByUserId.get(row.userId) !== row.dirtyVersion)
      ) {
        throw new Error("Subject Projection cutover Dirty batch changed before publication");
      }

      const published = await tx
        .insert(userProfiles)
        .values(profiles.map(profile => ({
          ...toUserProfileRow(profile),
          updateTime: profile.rebuiltAt,
        })))
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            subjectIdentifier: sql`excluded.subject_identifier`,
            username: sql`excluded.username`,
            name: sql`excluded.name`,
            mobile: sql`excluded.mobile`,
            wxId: sql`excluded.wx_id`,
            status: sql`excluded.status`,
            isDelete: sql`excluded.is_delete`,
            searchVisible: sql`excluded.search_visible`,
            profileSchemaVersion: sql`excluded.profile_schema_version`,
            sourceDirtyVersion: sql`excluded.source_dirty_version`,
            detail: sql`excluded.detail`,
            searchDoc: sql`excluded.search_doc`,
            subjectFacts: sql`excluded.subject_facts`,
            rebuiltAt: sql`excluded.rebuilt_at`,
            updateTime: sql`excluded.update_time`,
          },
          setWhere: sql`${userProfiles.sourceDirtyVersion} IS NULL
            OR ${userProfiles.sourceDirtyVersion} <= excluded.source_dirty_version`,
        })
        .returning({ userId: userProfiles.userId });
      if (published.length !== profiles.length) {
        throw new Error("Subject Projection cutover refused an older Profile batch");
      }

      const versionPredicates = profiles.map(profile => and(
        eq(userProfileDirty.userId, profile.userId),
        eq(userProfileDirty.dirtyVersion, profile.sourceDirtyVersion),
      ));
      const processed = await tx
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Processed,
          processedAt,
          processingStartedAt: null,
          lastError: null,
          updateTime: processedAt,
        })
        .where(and(
          eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
          or(...versionPredicates),
        ))
        .returning({ userId: userProfileDirty.userId });
      if (processed.length !== profiles.length) {
        throw new Error("Subject Projection cutover could not process the complete Dirty batch");
      }
      return { published: profiles.length };
    });
  }

  return { prepareBatch, publishBatch, readVerificationSummary, scanPage };
}

function parseCurrentProfile(row: {
  userId: number;
  userSubjectIdentifier: string;
  userStatus: UserStatus;
  userDeleted: boolean;
  profileUserId: number | null;
  profileSubjectIdentifier: string | null;
  username: string | null;
  name: string | null;
  mobile: string | null;
  wxId: string | null;
  profileStatus: UserStatus | null;
  profileDeleted: boolean | null;
  searchVisible: boolean | null;
  profileSchemaVersion: number | null;
  sourceDirtyVersion: string | null;
  detail: unknown;
  searchDoc: unknown;
  subjectFacts: unknown;
  rebuiltAt: Date | null;
  profileCreateTime: Date | null;
  profileUpdateTime: Date | null;
  dirtyVersion: string | null;
  dirtyStatus: string | null;
}) {
  if (
    row.profileUserId !== row.userId
    || row.profileSubjectIdentifier !== row.userSubjectIdentifier
    || row.profileStatus !== row.userStatus
    || row.profileDeleted !== row.userDeleted
    || row.profileSchemaVersion !== CURRENT_USER_PROFILE_SCHEMA_VERSION
    || row.sourceDirtyVersion === null
    || row.sourceDirtyVersion !== row.dirtyVersion
    || row.dirtyStatus !== UserProfileDirtyStatus.Processed
  ) {
    return null;
  }
  let detail;
  try {
    detail = parseUserProfileDetailDocument(row.detail);
  }
  catch {
    return null;
  }
  const profile = PublishedUserProfileSchema.safeParse({
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
    detail,
    searchDoc: row.searchDoc,
    subjectFacts: row.subjectFacts,
    rebuiltAt: row.rebuiltAt,
  });
  return profile.success ? profile.data : null;
}
