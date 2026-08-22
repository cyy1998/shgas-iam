import type { UserProfileDirtyReason } from "@iam/contracts";
import type { db as database, DbClient } from "@iam/db";
import type { OrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import type { ProfileV2MaintenancePageRow } from "./profile-v2-backfill";
import type { PublishedProfile } from "./profile.schema";
import type { UserProfileEffectiveRoleResolverPort } from "./user-profile-build.repository";
import {
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import { userProfileDirty, userProfiles, users } from "@iam/db/schema";
import {
  asc,
  count,
  countDistinct,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { createUserProfileDirtyRepository } from "./dirty.repository";
import { createProfileBuildRepository } from "./profile-build.repository";
import { createProfileBuilder } from "./profile-builder.service";
import {
  parseUserProfileDetailDocument,
  PublishedProfileSchema,
  USER_PROFILE_SCHEMA_VERSION,
} from "./profile.schema";
import { createPublishedProfileRepository } from "./published-profile.repository";

export interface CreateProfileV2MaintenanceRepositoryOptions {
  buildBatchSize: number;
  createRoleAssignmentResolver: (db: DbClient) => UserProfileEffectiveRoleResolverPort;
  createResponsibilityResolver: (
    db: DbClient,
  ) => Pick<OrganizationResponsibilityResolver, "resolveEffectiveResponsibilities">;
}

const PROFILE_V2_BACKFILL_REASON = UserProfileDirtyReasonValue.Backfill;
const PROFILE_V2_BACKFILL_REASON_JSON = JSON.stringify([PROFILE_V2_BACKFILL_REASON]);

export function createProfileV2MaintenanceRepository(
  db: typeof database,
  options: CreateProfileV2MaintenanceRepositoryOptions,
) {
  async function scanPage(input: {
    afterUserId: number;
    limit: number;
  }): Promise<ProfileV2MaintenancePageRow[]> {
    return await scanRows(db, {
      afterUserId: input.afterUserId,
      limit: input.limit,
    });
  }

  async function runBackfillTransaction(input: {
    page: ProfileV2MaintenancePageRow[];
    observedAt: Date;
  }) {
    const userIds = input.page.map(row => row.userId);
    if (userIds.length === 0)
      return { profiles: [], rebuilt: 0, reused: 0 };
    if (new Set(userIds).size !== userIds.length)
      throw new Error("Profile V2 backfill transaction contains duplicate users");

    return await db.transaction(async (tx) => {
      const lockedUsers = await tx
        .select({ userId: users.id })
        .from(users)
        .where(inArray(users.id, userIds))
        .orderBy(asc(users.id))
        .for("update");
      if (
        lockedUsers.length !== userIds.length
        || lockedUsers.some((row, index) => row.userId !== userIds[index])
      ) {
        throw new Error("Profile V2 backfill transaction could not lock the complete User batch");
      }

      const currentPage = await scanRowsByUserIds(tx, userIds);
      assertSameUserInventory(currentPage, input.page);
      const reusableProfiles = currentPage
        .filter(row => row.backfillCompleted)
        .map(row => row.currentProfile)
        .filter((profile): profile is PublishedProfile => profile !== null);
      const rebuildUserIds = currentPage
        .filter(row => !row.backfillCompleted)
        .map(row => row.userId);
      const targets = await prepareDirtyBatch(tx, rebuildUserIds, input.observedAt);
      const roleResolver = options.createRoleAssignmentResolver(tx);
      const responsibilityResolver = options.createResponsibilityResolver(tx);
      const builder = createProfileBuilder({
        buildRepository: createProfileBuildRepository(
          tx,
          roleResolver,
          responsibilityResolver,
        ),
        clock: { nowDate: () => input.observedAt },
        config: { batchSize: options.buildBatchSize },
      });
      const rebuiltProfiles = await builder.buildMany(targets);
      assertBuiltProfiles(rebuiltProfiles, targets);

      const candidateRepository = createPublishedProfileRepository(tx);
      const dirtyRepository = createUserProfileDirtyRepository(tx);
      for (const profile of rebuiltProfiles) {
        const published = await candidateRepository.upsert(profile);
        if (published === null)
          throw new Error("Profile V2 backfill refused a candidate in the atomic batch");
        const processed = await dirtyRepository.markProcessed({
          userId: profile.userId,
          dirtyVersion: profile.sourceDirtyVersion,
          processedAt: input.observedAt,
        });
        if (processed === null)
          throw new Error("Profile V2 backfill could not process the complete Dirty batch");
      }

      const profileByUserId = new Map(
        [...reusableProfiles, ...rebuiltProfiles].map(profile => [profile.userId, profile]),
      );
      return {
        profiles: userIds.map((userId) => {
          const profile = profileByUserId.get(userId);
          if (profile === undefined)
            throw new Error("Profile V2 backfill transaction returned an incomplete Profile batch");
          return profile;
        }),
        rebuilt: rebuiltProfiles.length,
        reused: reusableProfiles.length,
      };
    });
  }

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
    const user = userSummary[0];
    const profile = profileSummary[0];
    const orphan = orphanSummary[0];
    if (user === undefined || profile === undefined || orphan === undefined)
      throw new Error("Profile V2 verification summary is incomplete");
    return { ...user, ...profile, ...orphan };
  }

  async function rebuildExpected(
    profiles: PublishedProfile[],
    observedAt: Date,
  ) {
    if (profiles.length === 0)
      return [];
    const builder = createProfileBuilder({
      buildRepository: createProfileBuildRepository(
        db,
        options.createRoleAssignmentResolver(db),
        options.createResponsibilityResolver(db),
      ),
      clock: { nowDate: () => observedAt },
      config: { batchSize: options.buildBatchSize },
    });
    return await builder.buildMany(profiles.map(profile => ({
      userId: profile.userId,
      sourceDirtyVersion: profile.sourceDirtyVersion,
    })));
  }

  return {
    rebuildExpected,
    readVerificationSummary,
    runBackfillTransaction,
    scanPage,
  };
}

async function prepareDirtyBatch(
  tx: DbClient,
  userIds: number[],
  observedAt: Date,
) {
  if (userIds.length === 0)
    return [];
  const reasonCodes: UserProfileDirtyReason[] = [PROFILE_V2_BACKFILL_REASON];
  const rows = await tx
    .insert(userProfileDirty)
    .values(userIds.map(userId => ({
      userId,
      dirtyVersion: "1",
      status: UserProfileDirtyStatus.Processing,
      reasonCodes,
      dirtyAt: observedAt,
      processingStartedAt: observedAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      lastJobId: null,
      updateTime: observedAt,
    })))
    .onConflictDoUpdate({
      target: userProfileDirty.userId,
      set: {
        // Preparation and publication share this transaction. A committed V2
        // attempt is reused before reaching this function; every other row must
        // advance even if an unrelated operation left a Backfill reason behind.
        dirtyVersion: sql`${userProfileDirty.dirtyVersion} + 1`,
        status: UserProfileDirtyStatus.Processing,
        reasonCodes,
        dirtyAt: observedAt,
        processingStartedAt: observedAt,
        processedAt: null,
        attempts: 0,
        lastError: null,
        lastJobId: null,
        updateTime: observedAt,
      },
    })
    .returning({
      userId: userProfileDirty.userId,
      sourceDirtyVersion: userProfileDirty.dirtyVersion,
    });
  return rows.sort((left, right) => left.userId - right.userId);
}

type ProfileRow = Awaited<ReturnType<typeof selectProfileRows>>[number];

async function scanRows(
  db: DbClient,
  input: { afterUserId: number; limit: number },
) {
  const rows = await selectProfileRows(db)
    .where(gt(users.id, input.afterUserId))
    .orderBy(asc(users.id))
    .limit(input.limit);
  return rows.map(toPageRow);
}

async function scanRowsByUserIds(db: DbClient, userIds: number[]) {
  const rows = await selectProfileRows(db)
    .where(inArray(users.id, userIds))
    .orderBy(asc(users.id));
  return rows.map(toPageRow);
}

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
      dirtyHasBackfill: sql<boolean>`COALESCE(
        ${userProfileDirty.reasonCodes} @> ${PROFILE_V2_BACKFILL_REASON_JSON}::jsonb,
        false
      )`,
      dirtyStatus: userProfileDirty.status,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(userProfileDirty, eq(userProfileDirty.userId, users.id));
}

function toPageRow(row: ProfileRow): ProfileV2MaintenancePageRow {
  const accountAvailable = row.userStatus === UserStatus.Enable && !row.userDeleted;
  if (row.profileUserId === null) {
    return profileIssueRow(row, accountAvailable, "profile-missing");
  }
  if (
    row.profileUserId !== row.userId
    || row.profileSubjectIdentifier !== row.userSubjectIdentifier
    || row.profileStatus !== row.userStatus
    || row.profileDeleted !== row.userDeleted
  ) {
    return profileIssueRow(row, accountAvailable, "profile-identity-mismatch");
  }

  let detail: unknown;
  try {
    detail = parseUserProfileDetailDocument(row.detail);
  }
  catch {
    return profileIssueRow(row, accountAvailable, "profile-v2-invalid");
  }
  const parsed = PublishedProfileSchema.safeParse({
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
  if (!parsed.success || row.profileSchemaVersion !== USER_PROFILE_SCHEMA_VERSION)
    return profileIssueRow(row, accountAvailable, "profile-v2-invalid");
  if (
    row.dirtyStatus !== UserProfileDirtyStatus.Processed
    || row.dirtyVersion !== parsed.data.sourceDirtyVersion
  ) {
    return profileIssueRow(row, accountAvailable, "profile-not-current");
  }
  const backfillCompleted = row.dirtyHasBackfill;
  return {
    userId: row.userId,
    subjectIdentifier: row.userSubjectIdentifier,
    accountAvailable,
    currentProfile: parsed.data,
    backfillCompleted,
    profileIssue: backfillCompleted ? null : "profile-backfill-marker-missing",
  };
}

function profileIssueRow(
  row: Pick<ProfileRow, "userId" | "userSubjectIdentifier">,
  accountAvailable: boolean,
  profileIssue: string,
): ProfileV2MaintenancePageRow {
  return {
    userId: row.userId,
    subjectIdentifier: row.userSubjectIdentifier,
    accountAvailable,
    currentProfile: null,
    backfillCompleted: false,
    profileIssue,
  };
}

function assertSameUserInventory(
  current: ProfileV2MaintenancePageRow[],
  scanned: ProfileV2MaintenancePageRow[],
) {
  if (
    current.length !== scanned.length
    || current.some((row, index) =>
      row.userId !== scanned[index]!.userId
      || row.subjectIdentifier !== scanned[index]!.subjectIdentifier)
  ) {
    throw new Error("Profile V2 backfill User inventory changed before the transaction");
  }
}

function assertBuiltProfiles(
  profiles: PublishedProfile[],
  targets: Array<{ userId: number; sourceDirtyVersion: string }>,
) {
  if (
    profiles.length !== targets.length
    || profiles.some((profile, index) =>
      profile.userId !== targets[index]!.userId
      || profile.sourceDirtyVersion !== targets[index]!.sourceDirtyVersion)
  ) {
    throw new Error("Profile V2 builder returned an incomplete atomic batch");
  }
}
