import type { RebuildUserProfileJobPayload, UserProfileDirtyReason } from "@iam/contracts";
import type { MarkUserProfileDirtyInput } from "./dirty.repository";
import { UserProfileDirtyReason as UserProfileDirtyReasonValue } from "@iam/contracts";

export interface UserProfileDirtyWorkflowRow {
  userId: number;
  dirtyVersion: string;
  reasonCodes: UserProfileDirtyReason[];
}

export interface UserProfileDirtyWorkflowMetadata {
  reason?: UserProfileDirtyReason;
  requestedAt: string;
  requestId?: string;
  traceId?: string;
}

export interface UserProfileDirtyWorkflowDeliveryPort {
  deliver: (
    payloads: RebuildUserProfileJobPayload[],
  ) => Promise<UserProfileDirtyWorkflowDeliveryResult | void> | UserProfileDirtyWorkflowDeliveryResult | void;
}

export interface UserProfileDirtyWorkflowDeliveryResult {
  delivered: number;
}

export interface UserProfileDirtyJobProducerPort {
  enqueueRebuildJobs: (
    inputs: RebuildUserProfileJobPayload[],
  ) => Promise<{ enqueued: number; jobIds: string[] }>;
}

export interface UserProfileDirtyWorkflowDeps {
  dirtyRepository: {
    markManyDirty: (inputs: MarkUserProfileDirtyInput[]) => Promise<UserProfileDirtyWorkflowRow[]>;
  };
  delivery: UserProfileDirtyWorkflowDeliveryPort;
  clock: {
    nowDate: () => Date;
  };
}

export function createUserProfileDirtyWorkflow(deps: UserProfileDirtyWorkflowDeps) {
  async function deliverRows(
    rows: UserProfileDirtyWorkflowRow[],
    metadata: UserProfileDirtyWorkflowMetadata,
  ) {
    if (rows.length === 0)
      return { delivered: 0, userIds: [] };

    const payloads = rows.map(row => ({
      userId: row.userId,
      dirtyVersion: row.dirtyVersion,
      reason: row.reasonCodes[0] ?? metadata.reason ?? UserProfileDirtyReasonValue.ManualRebuild,
      requestedAt: metadata.requestedAt,
      ...(metadata.requestId === undefined ? {} : { requestId: metadata.requestId }),
      ...(metadata.traceId === undefined ? {} : { traceId: metadata.traceId }),
    }));
    const result = await deps.delivery.deliver(payloads);
    return {
      delivered: result?.delivered ?? payloads.length,
      userIds: rows.map(row => row.userId),
    };
  }

  return {
    async markDirty(
      inputs: Array<{ userId: number; reasonCodes: UserProfileDirtyReason[] }>,
      metadata: Omit<UserProfileDirtyWorkflowMetadata, "requestedAt"> & { requestedAt?: string } = {},
    ) {
      if (inputs.length === 0)
        return { delivered: 0, userIds: [] };

      const dirtyAt = deps.clock.nowDate();
      const rows = await deps.dirtyRepository.markManyDirty(inputs.map(input => ({
        ...input,
        dirtyAt,
      })));
      return await deliverRows(rows, {
        ...metadata,
        requestedAt: metadata.requestedAt ?? dirtyAt.toISOString(),
      });
    },
    deliverRows,
  };
}

export function createImmediateUserProfileDirtyDelivery(
  jobProducer: UserProfileDirtyJobProducerPort,
): UserProfileDirtyWorkflowDeliveryPort {
  return {
    async deliver(payloads) {
      const result = await jobProducer.enqueueRebuildJobs(payloads);
      return { delivered: result.enqueued };
    },
  };
}
