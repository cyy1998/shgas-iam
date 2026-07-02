import type { UserProfileDirtyReason } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { UserProfileDirty } from "@iam/db/schema";
import { UserProfileDirtyStatus, UserProfileJobName } from "@iam/contracts";
import { firstRow } from "@iam/db/query-utils";
import { userProfileDirty } from "@iam/db/schema";
import { buildUserVersionJobId } from "@iam/jobs";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { formatDirtyVersion } from "./dirty-version";

export interface MarkUserProfileDirtyInput {
  userId: number;
  reasonCodes: UserProfileDirtyReason[];
  dirtyAt: Date;
}

export interface ClaimUserProfileDirtyInput {
  userId: number;
  dirtyVersion: string;
  now: Date;
  jobId?: string;
}

export interface MarkUserProfileDirtyProcessedInput {
  userId: number;
  dirtyVersion: string;
  processedAt: Date;
}

export interface MarkUserProfileDirtyFailedInput {
  userId: number;
  dirtyVersion: string;
  error: string;
  failedAt: Date;
}

export interface ScanRepairableDirtyInput {
  staleBefore: Date;
  limit: number;
}

export interface ResetStaleProcessingDirtyInput {
  userId: number;
  dirtyVersion: string;
  staleBefore: Date;
  now: Date;
}

const INITIAL_DIRTY_VERSION = "1";

export function createUserProfileDirtyRepository(db: DbClient) {
  return {
    async getByUserId(userId: number) {
      return await db.query.userProfileDirty.findFirst({ where: { userId } }) ?? null;
    },

    async markDirty(input: MarkUserProfileDirtyInput) {
      return firstRow(await markManyDirty(db, [input])) ?? null;
    },

    async markManyDirty(inputs: MarkUserProfileDirtyInput[]) {
      return await markManyDirty(db, inputs);
    },

    async claimForProcessing(input: ClaimUserProfileDirtyInput) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Processing,
          processingStartedAt: input.now,
          processedAt: null,
          lastJobId: input.jobId,
          lastError: null,
          updateTime: input.now,
        })
        .where(and(
          eq(userProfileDirty.userId, input.userId),
          eq(userProfileDirty.dirtyVersion, formatDirtyVersion(input.dirtyVersion)),
          inArray(userProfileDirty.status, [UserProfileDirtyStatus.Pending, UserProfileDirtyStatus.Failed]),
        ))
        .returning()) ?? null;
    },

    async markProcessed(input: MarkUserProfileDirtyProcessedInput) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Processed,
          processedAt: input.processedAt,
          processingStartedAt: null,
          lastError: null,
          updateTime: input.processedAt,
        })
        .where(and(
          eq(userProfileDirty.userId, input.userId),
          eq(userProfileDirty.dirtyVersion, formatDirtyVersion(input.dirtyVersion)),
          eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
        ))
        .returning()) ?? null;
    },

    async markFailed(input: MarkUserProfileDirtyFailedInput) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Failed,
          lastError: input.error,
          processingStartedAt: null,
          attempts: sql`${userProfileDirty.attempts} + 1`,
          updateTime: input.failedAt,
        })
        .where(and(
          eq(userProfileDirty.userId, input.userId),
          eq(userProfileDirty.dirtyVersion, formatDirtyVersion(input.dirtyVersion)),
          eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
        ))
        .returning()) ?? null;
    },

    async scanFailedOrStale(input: ScanRepairableDirtyInput) {
      return await db
        .select()
        .from(userProfileDirty)
        .where(or(
          eq(userProfileDirty.status, UserProfileDirtyStatus.Failed),
          and(
            eq(userProfileDirty.status, UserProfileDirtyStatus.Pending),
            lt(userProfileDirty.dirtyAt, input.staleBefore),
          ),
          and(
            eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
            lt(userProfileDirty.processingStartedAt, input.staleBefore),
          ),
        ))
        .orderBy(asc(userProfileDirty.dirtyAt))
        .limit(input.limit);
    },

    async resetStaleProcessing(input: ResetStaleProcessingDirtyInput) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Pending,
          processingStartedAt: null,
          lastError: null,
          updateTime: input.now,
        })
        .where(and(
          eq(userProfileDirty.userId, input.userId),
          eq(userProfileDirty.dirtyVersion, formatDirtyVersion(input.dirtyVersion)),
          eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
          lt(userProfileDirty.processingStartedAt, input.staleBefore),
        ))
        .returning()) ?? null;
    },
  };
}

export type UserProfileDirtyRepository = ReturnType<typeof createUserProfileDirtyRepository>;

export function mergeUserProfileDirtyReasons(
  existing: UserProfileDirty["reasonCodes"],
  incoming: UserProfileDirtyReason[],
) {
  return [...new Set([...existing, ...incoming])];
}

async function markManyDirty(db: DbClient, inputs: MarkUserProfileDirtyInput[]) {
  if (inputs.length === 0)
    return [];

  const dirtyRows = mergeInputsByUserId(inputs).map(input => ({
    userId: input.userId,
    status: UserProfileDirtyStatus.Pending,
    reasonCodes: input.reasonCodes,
    dirtyAt: input.dirtyAt,
    processingStartedAt: null,
    processedAt: null,
    attempts: 0,
    lastError: null,
    lastJobId: buildRebuildJobId(input.userId, INITIAL_DIRTY_VERSION),
  }));
  const nextDirtyVersion = sql<string>`${userProfileDirty.dirtyVersion} + 1`;

  return await db
    .insert(userProfileDirty)
    .values(dirtyRows)
    .onConflictDoUpdate({
      target: userProfileDirty.userId,
      set: {
        dirtyVersion: nextDirtyVersion,
        status: UserProfileDirtyStatus.Pending,
        reasonCodes: sql<UserProfileDirtyReason[]>`excluded.reason_codes`,
        dirtyAt: sql`excluded.dirty_at`,
        processingStartedAt: null,
        processedAt: null,
        attempts: 0,
        lastError: null,
        lastJobId: sql<string>`concat(${UserProfileJobName.RebuildUserProfile}::text, '|', ${userProfileDirty.userId}, '|', ${nextDirtyVersion})`,
        updateTime: new Date(),
      },
    })
    .returning();
}

function mergeInputsByUserId(inputs: MarkUserProfileDirtyInput[]) {
  const byUserId = new Map<number, MarkUserProfileDirtyInput>();
  for (const input of inputs) {
    const existing = byUserId.get(input.userId);
    if (existing === undefined) {
      byUserId.set(input.userId, {
        ...input,
        reasonCodes: mergeUserProfileDirtyReasons([], input.reasonCodes),
      });
      continue;
    }
    byUserId.set(input.userId, {
      userId: input.userId,
      reasonCodes: mergeUserProfileDirtyReasons(existing.reasonCodes, input.reasonCodes),
      dirtyAt: input.dirtyAt > existing.dirtyAt ? input.dirtyAt : existing.dirtyAt,
    });
  }
  return [...byUserId.values()];
}

function buildRebuildJobId(userId: number, dirtyVersion: string) {
  return buildUserVersionJobId(UserProfileJobName.RebuildUserProfile, userId, dirtyVersion);
}
