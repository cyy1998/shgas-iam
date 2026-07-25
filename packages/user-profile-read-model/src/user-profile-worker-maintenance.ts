import type {
  RebuildUserProfileJobPayload,
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
} from "@iam/contracts";
import {
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
  UserProfileDirtyStatus as UserProfileDirtyStatusValue,
} from "@iam/contracts";
import {
  createImmediateUserProfileDirtyDelivery,
  createUserProfileDirtyWorkflow,
} from "./dirty-workflow";

export interface UserProfileMaintenanceUserRepositoryPort {
  scanUserIds: (input: { afterUserId?: number; limit: number }) => Promise<number[]>;
}

export interface UserProfileMaintenanceDirtyRow {
  userId: number;
  dirtyVersion: string;
  reasonCodes: UserProfileDirtyReason[];
}

export interface UserProfileMaintenanceRepairRow extends UserProfileMaintenanceDirtyRow {
  status: UserProfileDirtyStatus;
  dirtyAt: Date;
  processingStartedAt: Date | null;
}

export interface UserProfileMaintenanceMarkDirtyInput {
  userId: number;
  reasonCodes: UserProfileDirtyReason[];
  dirtyAt: Date;
}

export interface UserProfileMaintenanceDirtyRepositoryPort {
  markManyDirty: (
    inputs: UserProfileMaintenanceMarkDirtyInput[],
  ) => Promise<UserProfileMaintenanceDirtyRow[]>;
  scanFailedOrStale: (input: {
    staleBefore: Date;
    limit: number;
  }) => Promise<UserProfileMaintenanceRepairRow[]>;
  resetStaleProcessing: (input: {
    userId: number;
    dirtyVersion: string;
    staleBefore: Date;
    now: Date;
  }) => Promise<UserProfileMaintenanceRepairRow | null>;
}

export interface UserProfileMaintenanceJobProducerPort {
  enqueueRebuildJobs: (
    inputs: RebuildUserProfileJobPayload[],
  ) => Promise<{ enqueued: number; jobIds: string[] }>;
}

export interface CreateUserProfileWorkerMaintenanceDeps {
  userRepository: UserProfileMaintenanceUserRepositoryPort;
  dirtyRepository: UserProfileMaintenanceDirtyRepositoryPort;
  jobProducer: UserProfileMaintenanceJobProducerPort;
  clock: {
    nowDate: () => Date;
  };
  config: {
    backfillBatchSize: number;
  };
}

export function createUserProfileWorkerMaintenance(deps: CreateUserProfileWorkerMaintenanceDeps) {
  const dirtyWorkflow = createUserProfileDirtyWorkflow({
    dirtyRepository: deps.dirtyRepository,
    delivery: createImmediateUserProfileDirtyDelivery(deps.jobProducer),
    clock: deps.clock,
  });

  async function backfillAllUsers(options: { batchSize?: number } = {}) {
    const batchSize = options.batchSize ?? deps.config.backfillBatchSize;
    let afterUserId: number | undefined;
    let enqueued = 0;
    while (true) {
      const userIds = await deps.userRepository.scanUserIds({
        afterUserId,
        limit: batchSize,
      });
      if (userIds.length === 0)
        break;

      const uniqueUserIds = [...new Set(userIds)]
        .filter(userId => afterUserId === undefined || userId > afterUserId);
      const result = await dirtyWorkflow.markDirty(uniqueUserIds.map(userId => ({
        userId,
        reasonCodes: [UserProfileDirtyReasonValue.Backfill],
      })));
      enqueued += result.delivered;
      const nextAfterUserId = userIds.reduce(
        (highestUserId, userId) => Math.max(highestUserId, userId),
        afterUserId ?? 0,
      );
      if (afterUserId !== undefined && nextAfterUserId <= afterUserId)
        break;
      afterUserId = nextAfterUserId;
      if (userIds.length < batchSize)
        break;
    }
    return { enqueued };
  }

  async function repairFailedOrStale(input: { staleBefore: Date; limit?: number }) {
    const rows = await deps.dirtyRepository.scanFailedOrStale({
      staleBefore: input.staleBefore,
      limit: input.limit ?? deps.config.backfillBatchSize,
    });
    const now = deps.clock.nowDate();
    const repairRows: UserProfileMaintenanceRepairRow[] = [];
    for (const row of rows) {
      if (
        row.status === UserProfileDirtyStatusValue.Failed
        || (row.status === UserProfileDirtyStatusValue.Pending && row.dirtyAt < input.staleBefore)
      ) {
        repairRows.push(row);
        continue;
      }
      if (
        row.status !== UserProfileDirtyStatusValue.Processing
        || row.processingStartedAt === null
        || row.processingStartedAt >= input.staleBefore
      ) {
        continue;
      }
      const reset = await deps.dirtyRepository.resetStaleProcessing({
        userId: row.userId,
        dirtyVersion: row.dirtyVersion,
        staleBefore: input.staleBefore,
        now,
      });
      if (reset !== null)
        repairRows.push(reset);
    }
    const result = await dirtyWorkflow.deliverRows(repairRows, {
      requestedAt: now.toISOString(),
    });
    return {
      enqueued: result.delivered,
      userIds: result.userIds,
    };
  }

  return {
    backfillAllUsers,
    repairFailedOrStale,
  };
}

export type UserProfileWorkerMaintenance = ReturnType<typeof createUserProfileWorkerMaintenance>;
