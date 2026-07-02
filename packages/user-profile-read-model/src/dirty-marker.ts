import type { UserProfileDirtyReason } from "@iam/contracts";
import type { MarkUserProfileDirtyInput } from "./dirty.repository";
import type { UserProfileExpansionScope } from "./scope.repository";

export interface UserProfileAfterCommitPort {
  bestEffort: (name: string, callback: () => Promise<void> | void) => void;
}

export interface UserProfileDirtyRepositoryPort {
  markManyDirty: (inputs: MarkUserProfileDirtyInput[]) => Promise<UserProfileDirtyWakeUpRow[]>;
}

export interface UserProfileScopeRepositoryPort {
  resolveUserIds: (scope: UserProfileExpansionScope) => Promise<number[]>;
}

export interface UserProfileDirtyJobProducerPort {
  enqueueRebuildJob: (input: {
    userId: number;
    dirtyVersion: string;
    reason: UserProfileDirtyReason;
    requestedAt?: string;
    requestId?: string;
    traceId?: string;
  }) => Promise<{ jobId: string }>;
  enqueueRebuildJobs: (inputs: Array<{
    userId: number;
    dirtyVersion: string;
    reason: UserProfileDirtyReason;
    requestedAt?: string;
    requestId?: string;
    traceId?: string;
  }>) => Promise<{ enqueued: number; jobIds: string[] }>;
}

export interface UserProfileDirtyMarkerDeps {
  dirtyRepository: UserProfileDirtyRepositoryPort;
  scopeRepository: UserProfileScopeRepositoryPort;
  jobProducer: UserProfileDirtyJobProducerPort;
  clock: {
    nowDate: () => Date;
  };
}

export interface MarkUserProfileUsersDirtyInput {
  userIds: number[];
  reasonCodes: UserProfileDirtyReason[];
  afterCommit: UserProfileAfterCommitPort;
  requestedAt?: string;
  requestId?: string;
  traceId?: string;
}

export interface MarkUserProfileScopeDirtyInput {
  scope: UserProfileExpansionScope;
  reasonCodes: UserProfileDirtyReason[];
  afterCommit: UserProfileAfterCommitPort;
  requestedAt?: string;
  requestId?: string;
  traceId?: string;
}

export interface UserProfileDirtyWakeUpRow {
  userId: number;
  dirtyVersion: string;
  reasonCodes: UserProfileDirtyReason[];
  dirtyAt: Date;
}

export function createUserProfileDirtyMarker(deps: UserProfileDirtyMarkerDeps) {
  async function markUsersDirty(input: MarkUserProfileUsersDirtyInput) {
    const userIds = normalizeUserIds(input.userIds);
    const reasonCodes = normalizeReasonCodes(input.reasonCodes);
    if (userIds.length === 0 || reasonCodes.length === 0) {
      return { marked: 0, userIds };
    }

    const reason = reasonCodes[0]!;
    const dirtyAt = deps.clock.nowDate();
    const rows = await deps.dirtyRepository.markManyDirty(userIds.map(userId => ({
      userId,
      reasonCodes,
      dirtyAt,
    })));

    registerRebuildWakeUp({
      rows,
      reason,
      afterCommit: input.afterCommit,
      requestedAt: input.requestedAt ?? dirtyAt.toISOString(),
      requestId: input.requestId,
      traceId: input.traceId,
    });

    return { marked: rows.length, userIds: rows.map(row => row.userId) };
  }

  async function markScopeDirty(input: MarkUserProfileScopeDirtyInput) {
    const userIds = await deps.scopeRepository.resolveUserIds(input.scope);
    return await markUsersDirty({
      userIds,
      reasonCodes: input.reasonCodes,
      afterCommit: input.afterCommit,
      requestedAt: input.requestedAt,
      requestId: input.requestId,
      traceId: input.traceId,
    });
  }

  function registerRebuildWakeUp(input: {
    rows: UserProfileDirtyWakeUpRow[];
    reason: UserProfileDirtyReason;
    afterCommit: UserProfileAfterCommitPort;
    requestedAt: string;
    requestId?: string;
    traceId?: string;
  }) {
    input.afterCommit.bestEffort("user_profile.rebuild.wake_up", async () => {
      await deps.jobProducer.enqueueRebuildJobs(input.rows.map(row => ({
        userId: row.userId,
        dirtyVersion: row.dirtyVersion,
        reason: row.reasonCodes[0] ?? input.reason,
        requestedAt: input.requestedAt,
        requestId: input.requestId,
        traceId: input.traceId,
      })));
    });
  }

  return {
    markUsersDirty,
    markScopeDirty,
  };
}

export type UserProfileDirtyMarker = ReturnType<typeof createUserProfileDirtyMarker>;

function normalizeUserIds(userIds: number[]) {
  return [...new Set(userIds)].filter(userId => Number.isInteger(userId) && userId > 0);
}

function normalizeReasonCodes(reasonCodes: UserProfileDirtyReason[]) {
  return [...new Set(reasonCodes)];
}
