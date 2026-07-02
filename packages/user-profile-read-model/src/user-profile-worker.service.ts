import type {
  ExpandUserProfileScopeJobPayload,
  RebuildUserProfileJobPayload,
  UserProfileDirtyReason,
} from "@iam/contracts";
import type { UserProfileDirty } from "@iam/db/schema";
import type {
  UserProfileDirtyRepository,
  UserProfileExpansionScope,
  UserProfileScopeRepository,
} from "./producer";
import type { UserProfileBuilder } from "./user-profile-builder.service";
import type { UserProfileRepository } from "./user-profile.repository";
import {
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
  UserProfileDirtyStatus,
  UserProfileScopeType,
} from "@iam/contracts";

export interface UserProfileJobProducerPort {
  enqueueRebuildJob: (input: {
    userId: number;
    dirtyVersion: string;
    reason: UserProfileDirtyReason;
    requestedAt: string;
    requestId?: string;
    traceId?: string;
  }) => Promise<{ jobId: string }>;
  enqueueRebuildJobs: (inputs: Array<{
    userId: number;
    dirtyVersion: string;
    reason: UserProfileDirtyReason;
    requestedAt: string;
    requestId?: string;
    traceId?: string;
  }>) => Promise<{ enqueued: number; jobIds: string[] }>;
}

export interface UserProfileWorkerServiceDeps {
  profileRepository: UserProfileRepository;
  dirtyRepository: UserProfileDirtyRepository;
  scopeRepository: UserProfileScopeRepository;
  builder: UserProfileBuilder;
  jobProducer: UserProfileJobProducerPort;
  clock: {
    nowDate: () => Date;
  };
  config: {
    backfillBatchSize: number;
  };
}

export function createUserProfileWorkerService(deps: UserProfileWorkerServiceDeps) {
  async function processRebuildUserProfile(
    payload: RebuildUserProfileJobPayload,
    options: { jobId?: string } = {},
  ) {
    const claimed = await deps.dirtyRepository.claimForProcessing({
      userId: payload.userId,
      dirtyVersion: payload.dirtyVersion,
      now: deps.clock.nowDate(),
      jobId: options.jobId,
    });
    if (claimed === null) {
      return { status: "skipped" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
    }

    try {
      const builtProfile = await deps.builder.buildOne(payload.userId);
      if (builtProfile !== null) {
        await deps.profileRepository.upsertProfile(builtProfile);
      }
      else {
        await deps.profileRepository.deleteByUserId(payload.userId);
      }
      const processed = await deps.dirtyRepository.markProcessed({
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
        processedAt: deps.clock.nowDate(),
      });
      if (processed === null) {
        return { status: "stale" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
      }
      return {
        status: builtProfile === null ? "missing" as const : "rebuilt" as const,
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
      };
    }
    catch (error) {
      const failed = await deps.dirtyRepository.markFailed({
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
        error: errorMessage(error),
        failedAt: deps.clock.nowDate(),
      });
      if (failed === null) {
        return { status: "stale" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
      }
      throw error;
    }
  }

  async function processExpandUserProfileScope(payload: ExpandUserProfileScopeJobPayload) {
    return await expandScope(toExpansionScope(payload), payload);
  }

  async function expandScope(
    scope: UserProfileExpansionScope,
    meta: {
      reason: UserProfileDirtyReason;
      requestedAt?: string;
      requestId?: string;
      traceId?: string;
    },
  ) {
    const userIds = await deps.scopeRepository.resolveUserIds(scope);
    return await markDirtyAndEnqueue(userIds, meta);
  }

  async function backfillAllUsers(options: { batchSize?: number } = {}) {
    const batchSize = options.batchSize ?? deps.config.backfillBatchSize;
    let afterUserId: number | undefined;
    let total = 0;
    while (true) {
      const userIds = await deps.scopeRepository.scanAllUserIds({ afterUserId, limit: batchSize });
      if (userIds.length === 0)
        break;

      const result = await markDirtyAndEnqueue(userIds, {
        reason: UserProfileDirtyReasonValue.Backfill,
      });
      total += result.enqueued;
      afterUserId = userIds[userIds.length - 1];
      if (userIds.length < batchSize)
        break;
    }
    return { enqueued: total };
  }

  async function repairFailedOrStale(input: { staleBefore: Date; limit?: number }) {
    const rows = await deps.dirtyRepository.scanFailedOrStale({
      staleBefore: input.staleBefore,
      limit: input.limit ?? deps.config.backfillBatchSize,
    });
    const now = deps.clock.nowDate();
    const repairRows = [];
    for (const row of rows) {
      if (row.status !== UserProfileDirtyStatus.Processing) {
        repairRows.push(row);
        continue;
      }

      const reset = await deps.dirtyRepository.resetStaleProcessing({
        userId: row.userId,
        dirtyVersion: row.dirtyVersion,
        staleBefore: input.staleBefore,
        now,
      });
      if (reset !== null) {
        repairRows.push(reset);
      }
    }
    return await enqueueDirtyRows(repairRows, {
      requestedAt: now.toISOString(),
    });
  }

  async function markDirtyAndEnqueue(
    userIds: number[],
    meta: {
      reason: UserProfileDirtyReason;
      requestedAt?: string;
      requestId?: string;
      traceId?: string;
    },
  ) {
    const uniqueUserIds = [...new Set(userIds)];
    const requestedAt = meta.requestedAt ?? deps.clock.nowDate().toISOString();
    const dirtyAt = deps.clock.nowDate();
    const rows = await deps.dirtyRepository.markManyDirty(uniqueUserIds.map(userId => ({
      userId,
      reasonCodes: [meta.reason],
      dirtyAt,
    })));
    return await enqueueDirtyRows(rows, {
      reason: meta.reason,
      requestedAt,
      requestId: meta.requestId,
      traceId: meta.traceId,
    });
  }

  async function enqueueDirtyRows(
    rows: UserProfileDirty[],
    meta: {
      reason?: UserProfileDirtyReason;
      requestedAt: string;
      requestId?: string;
      traceId?: string;
    },
  ) {
    await deps.jobProducer.enqueueRebuildJobs(rows.map(row => ({
      userId: row.userId,
      dirtyVersion: row.dirtyVersion,
      reason: row.reasonCodes[0] ?? meta.reason ?? UserProfileDirtyReasonValue.ManualRebuild,
      requestedAt: meta.requestedAt,
      requestId: meta.requestId,
      traceId: meta.traceId,
    })));
    return { enqueued: rows.length, userIds: rows.map(row => row.userId) };
  }

  return {
    processRebuildUserProfile,
    processExpandUserProfileScope,
    expandScope,
    backfillAllUsers,
    repairFailedOrStale,
  };
}

export type UserProfileWorkerService = ReturnType<typeof createUserProfileWorkerService>;

function toExpansionScope(payload: ExpandUserProfileScopeJobPayload): UserProfileExpansionScope {
  switch (payload.scopeType) {
    case UserProfileScopeType.AllUsers:
      return { scopeType: payload.scopeType };
    case UserProfileScopeType.UserIds:
      return { scopeType: payload.scopeType, userIds: payload.userIds };
    case UserProfileScopeType.UserId:
    case UserProfileScopeType.OrganizationId:
    case UserProfileScopeType.PositionId:
    case UserProfileScopeType.RoleId:
    case UserProfileScopeType.PrivilegeId:
    case UserProfileScopeType.EmploymentId:
      return { scopeType: payload.scopeType, scopeId: payload.scopeId };
    case UserProfileScopeType.PrivilegeCode:
      return { scopeType: payload.scopeType, scopeId: payload.scopeId };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
