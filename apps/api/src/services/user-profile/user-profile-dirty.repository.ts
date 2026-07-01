import type { UserProfileDirtyReason } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { UserProfileDirty } from "@iam/db/schema";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { firstRow } from "@iam/db/query-utils";
import { userProfileDirty } from "@iam/db/schema";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";

export interface MarkUserProfileDirtyInput {
  userId: number;
  reasonCodes: UserProfileDirtyReason[];
  dirtyAt: Date;
  lastJobId?: string;
}

export interface ClaimUserProfileDirtyInput {
  userId: number;
  now: Date;
  jobId?: string;
}

export interface ScanRepairableDirtyInput {
  staleBefore: Date;
  limit: number;
}

export function createUserProfileDirtyRepository(db: DbClient) {
  return {
    async getByUserId(userId: number) {
      return await db.query.userProfileDirty.findFirst({ where: { userId } }) ?? null;
    },

    async markDirty(input: MarkUserProfileDirtyInput) {
      const existing = await db.query.userProfileDirty.findFirst({ where: { userId: input.userId } });
      const reasonCodes = mergeReasonCodes(existing?.reasonCodes ?? [], input.reasonCodes);
      return firstRow(await db
        .insert(userProfileDirty)
        .values({
          userId: input.userId,
          status: UserProfileDirtyStatus.Pending,
          reasonCodes,
          dirtyAt: input.dirtyAt,
          processingStartedAt: null,
          processedAt: null,
          lastError: null,
          lastJobId: input.lastJobId,
        })
        .onConflictDoUpdate({
          target: userProfileDirty.userId,
          set: {
            status: UserProfileDirtyStatus.Pending,
            reasonCodes,
            dirtyAt: input.dirtyAt,
            processingStartedAt: null,
            processedAt: null,
            lastError: null,
            lastJobId: input.lastJobId,
            updateTime: new Date(),
          },
        })
        .returning())!;
    },

    async claimForProcessing(input: ClaimUserProfileDirtyInput) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Processing,
          processingStartedAt: input.now,
          processedAt: null,
          lastJobId: input.jobId,
          updateTime: new Date(),
        })
        .where(and(
          eq(userProfileDirty.userId, input.userId),
          inArray(userProfileDirty.status, [UserProfileDirtyStatus.Pending, UserProfileDirtyStatus.Failed]),
        ))
        .returning()) ?? null;
    },

    async markProcessed(userId: number, processedAt: Date) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Processed,
          processedAt,
          processingStartedAt: null,
          lastError: null,
          updateTime: new Date(),
        })
        .where(eq(userProfileDirty.userId, userId))
        .returning()) ?? null;
    },

    async markFailed(userId: number, error: string, failedAt: Date) {
      return firstRow(await db
        .update(userProfileDirty)
        .set({
          status: UserProfileDirtyStatus.Failed,
          lastError: error,
          processingStartedAt: null,
          attempts: sql`${userProfileDirty.attempts} + 1`,
          updateTime: failedAt,
        })
        .where(eq(userProfileDirty.userId, userId))
        .returning()) ?? null;
    },

    async scanFailedOrStale(input: ScanRepairableDirtyInput) {
      return await db
        .select()
        .from(userProfileDirty)
        .where(or(
          eq(userProfileDirty.status, UserProfileDirtyStatus.Failed),
          and(
            eq(userProfileDirty.status, UserProfileDirtyStatus.Processing),
            lt(userProfileDirty.processingStartedAt, input.staleBefore),
          ),
        ))
        .orderBy(asc(userProfileDirty.dirtyAt))
        .limit(input.limit);
    },
  };
}

export type UserProfileDirtyRepository = ReturnType<typeof createUserProfileDirtyRepository>;

function mergeReasonCodes(existing: UserProfileDirty["reasonCodes"], incoming: UserProfileDirtyReason[]) {
  return [...new Set([...existing, ...incoming])];
}
