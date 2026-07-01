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
    lastError: null,
    lastJobId: input.lastJobId ?? null,
  }));

  return await db
    .insert(userProfileDirty)
    .values(dirtyRows)
    .onConflictDoUpdate({
      target: userProfileDirty.userId,
      set: {
        status: UserProfileDirtyStatus.Pending,
        reasonCodes: sql<UserProfileDirtyReason[]>`(
          select coalesce(jsonb_agg(distinct reason_code.value order by reason_code.value), '[]'::jsonb)
          from jsonb_array_elements_text(${userProfileDirty.reasonCodes} || excluded.reason_codes) as reason_code(value)
        )`,
        dirtyAt: sql`excluded.dirty_at`,
        processingStartedAt: null,
        processedAt: null,
        lastError: null,
        lastJobId: sql`coalesce(excluded.last_job_id, ${userProfileDirty.lastJobId})`,
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
      lastJobId: input.lastJobId ?? existing.lastJobId,
    });
  }
  return [...byUserId.values()];
}
