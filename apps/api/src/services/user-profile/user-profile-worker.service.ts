import type {
  ExpandUserProfileScopeJobPayload,
  RebuildUserProfileJobPayload,
  UserProfileDirtyReason,
} from "@iam/contracts";
import type { UserProfileBuilder } from "./user-profile-builder.service";
import type { UserProfileDirtyRepository } from "./user-profile-dirty.repository";
import type { UserProfileExpansionScope, UserProfileScopeRepository } from "./user-profile-scope.repository";
import type { UserProfileRepository } from "./user-profile.repository";
import { UserProfileDirtyReason as UserProfileDirtyReasonValue, UserProfileScopeType } from "@iam/contracts";

export interface UserProfileJobProducerPort {
  buildRebuildJobId: (userId: number) => string;
  enqueueRebuildJob: (input: {
    userId: number;
    reason: UserProfileDirtyReason;
    requestedAt: string;
    requestId?: string;
    traceId?: string;
  }) => Promise<{ jobId: string }>;
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
      now: deps.clock.nowDate(),
      jobId: options.jobId,
    });
    if (claimed === null) {
      return { status: "skipped" as const, userId: payload.userId };
    }

    try {
      const builtProfile = await deps.builder.buildOne(payload.userId);
      if (builtProfile !== null) {
        await deps.profileRepository.upsertProfile(builtProfile);
      }
      await deps.dirtyRepository.markProcessed(payload.userId, deps.clock.nowDate());
      return {
        status: builtProfile === null ? "missing" as const : "rebuilt" as const,
        userId: payload.userId,
      };
    }
    catch (error) {
      await deps.dirtyRepository.markFailed(payload.userId, errorMessage(error), deps.clock.nowDate());
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
    return await markDirtyAndEnqueue(rows.map(row => row.userId), {
      reason: UserProfileDirtyReasonValue.ManualRebuild,
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
    for (const userId of uniqueUserIds) {
      await deps.dirtyRepository.markDirty({
        userId,
        reasonCodes: [meta.reason],
        dirtyAt: deps.clock.nowDate(),
        lastJobId: deps.jobProducer.buildRebuildJobId(userId),
      });
      await deps.jobProducer.enqueueRebuildJob({
        userId,
        reason: meta.reason,
        requestedAt,
        requestId: meta.requestId,
        traceId: meta.traceId,
      });
    }
    return { enqueued: uniqueUserIds.length, userIds: uniqueUserIds };
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
