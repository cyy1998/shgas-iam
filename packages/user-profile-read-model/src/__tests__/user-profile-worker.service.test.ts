import { UserProfileDirtyReason, UserProfileDirtyStatus, UserProfileScopeType, UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileWorkerService } from "../user-profile-worker.service";
import { CURRENT_USER_PROFILE_SCHEMA_VERSION } from "../user-profile.schema";

const now = new Date("2026-06-30T08:00:00.000Z");

function builtProfile(userId = 1) {
  return {
    userId,
    username: `user${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
    detail: {} as any,
    searchDoc: {} as any,
    rebuiltAt: now,
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const deps = {
    profileRepository: {
      upsertProfile: mock(async () => builtProfile()),
      deleteByUserId: mock(async () => null),
    },
    dirtyRepository: {
      claimForProcessing: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
      markProcessed: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
      markFailed: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
      markDirty: mock(async (input: unknown) => input),
      markManyDirty: mock(async (inputs: Array<{ userId: number; reasonCodes: UserProfileDirtyReason[] }>) =>
        inputs.map((input, index) => ({
          userId: input.userId,
          dirtyVersion: String(index + 10),
          reasonCodes: input.reasonCodes,
          status: UserProfileDirtyStatus.Pending,
        }))),
      scanFailedOrStale: mock(async () => [
        {
          userId: 5,
          dirtyVersion: "7",
          reasonCodes: [UserProfileDirtyReason.UserUpdated],
          status: UserProfileDirtyStatus.Failed,
        },
        {
          userId: 6,
          dirtyVersion: "8",
          reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
          status: UserProfileDirtyStatus.Processing,
        },
      ]),
      resetStaleProcessing: mock(async (input: { userId: number; dirtyVersion: string }) => ({
        userId: input.userId,
        dirtyVersion: input.dirtyVersion,
        reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
        status: UserProfileDirtyStatus.Pending,
      })),
    },
    scopeRepository: {
      resolveUserIds: mock(async () => [1, 2]),
      scanAllUserIds: mock(async () => [] as number[]),
    },
    builder: {
      buildOne: mock(async (userId: number) => builtProfile(userId)),
    },
    jobProducer: {
      enqueueRebuildJob: mock(async (input: { userId: number; dirtyVersion: string }) => ({
        jobId: `rebuild-user-profile|${input.userId}|${input.dirtyVersion}`,
      })),
      enqueueRebuildJobs: mock(async (inputs: Array<{ userId: number; dirtyVersion: string }>) => ({
        enqueued: inputs.length,
        jobIds: inputs.map(input => `rebuild-user-profile|${input.userId}|${input.dirtyVersion}`),
      })),
    },
    clock: { nowDate: () => now },
    config: { backfillBatchSize: 2 },
    ...overrides,
  };
  return deps as any;
}

describe("UserProfileWorkerService", () => {
  test("rebuilds and marks dirty rows processed when a pending row exists", async () => {
    const deps = createDeps();
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    }, { jobId: "job-1" })).resolves.toEqual({ status: "rebuilt", userId: 1, dirtyVersion: "4" });

    expect(deps.dirtyRepository.claimForProcessing).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      now,
      jobId: "job-1",
    });
    expect(deps.profileRepository.upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    expect(deps.dirtyRepository.markProcessed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      processedAt: now,
    });
  });

  test("no-ops rebuild jobs when no pending or failed dirty row exists", async () => {
    const deps = createDeps({
      dirtyRepository: {
        claimForProcessing: mock(async () => null),
        markProcessed: mock(async () => null),
        markFailed: mock(async () => null),
        resetStaleProcessing: mock(async () => null),
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({ status: "skipped", userId: 1, dirtyVersion: "4" });

    expect(deps.builder.buildOne).not.toHaveBeenCalled();
    expect(deps.profileRepository.upsertProfile).not.toHaveBeenCalled();
  });

  test("records rebuild failures on the dirty row", async () => {
    const error = new Error("builder failed");
    const deps = createDeps({
      builder: {
        buildOne: mock(async () => {
          throw error;
        }),
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).rejects.toThrow("builder failed");

    expect(deps.dirtyRepository.markFailed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      error: "builder failed",
      failedAt: now,
    });
  });

  test("deletes stale profile rows when the source user is missing", async () => {
    const deps = createDeps({
      builder: {
        buildOne: mock(async () => null),
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({ status: "missing", userId: 1, dirtyVersion: "4" });

    expect(deps.profileRepository.deleteByUserId).toHaveBeenCalledWith(1);
    expect(deps.dirtyRepository.markProcessed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      processedAt: now,
    });
  });

  test("treats stale processed CAS as a no-op result", async () => {
    const deps = createDeps({
      dirtyRepository: {
        ...createDeps().dirtyRepository,
        markProcessed: mock(async () => null),
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({ status: "stale", userId: 1, dirtyVersion: "4" });
  });

  test("expands organization, role, and privilege scopes through the scope repository", async () => {
    const deps = createDeps();
    const service = createUserProfileWorkerService(deps);

    await service.processExpandUserProfileScope({
      scopeType: UserProfileScopeType.OrganizationId,
      scopeId: 10,
      bucket: "b1",
      reason: UserProfileDirtyReason.OrganizationUpdated,
    });
    await service.processExpandUserProfileScope({
      scopeType: UserProfileScopeType.RoleId,
      scopeId: 20,
      bucket: "b1",
      reason: UserProfileDirtyReason.RoleUpdated,
    });
    await service.processExpandUserProfileScope({
      scopeType: UserProfileScopeType.PrivilegeId,
      scopeId: 30,
      bucket: "b1",
      reason: UserProfileDirtyReason.PrivilegeUpdated,
    });

    expect(deps.scopeRepository.resolveUserIds.mock.calls.map((call: any) => call[0])).toEqual([
      { scopeType: UserProfileScopeType.OrganizationId, scopeId: 10 },
      { scopeType: UserProfileScopeType.RoleId, scopeId: 20 },
      { scopeType: UserProfileScopeType.PrivilegeId, scopeId: 30 },
    ]);
    expect(deps.dirtyRepository.markManyDirty).toHaveBeenCalledTimes(3);
    expect(deps.jobProducer.enqueueRebuildJobs).toHaveBeenCalledTimes(3);
  });

  test("backfills users in batches", async () => {
    const scanAllUserIds = mock(async ({ afterUserId }: { afterUserId?: number; limit: number }) => {
      if (afterUserId === undefined)
        return [1, 2];
      if (afterUserId === 2)
        return [3];
      return [];
    });
    const deps = createDeps({
      scopeRepository: {
        resolveUserIds: mock(async () => []),
        scanAllUserIds,
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.backfillAllUsers()).resolves.toEqual({ enqueued: 3 });
    expect(scanAllUserIds.mock.calls.map((call: any) => call[0])).toEqual([
      { afterUserId: undefined, limit: 2 },
      { afterUserId: 2, limit: 2 },
    ]);
  });

  test("repairs failed or stale dirty rows by re-enqueueing rebuilds", async () => {
    const deps = createDeps();
    const service = createUserProfileWorkerService(deps);
    const staleBefore = new Date("2026-06-30T07:00:00.000Z");

    await expect(service.repairFailedOrStale({ staleBefore })).resolves.toEqual({
      enqueued: 2,
      userIds: [5, 6],
    });
    expect(deps.dirtyRepository.scanFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 2 });
    expect(deps.dirtyRepository.resetStaleProcessing).toHaveBeenCalledWith({
      userId: 6,
      dirtyVersion: "8",
      staleBefore,
      now,
    });
    expect(deps.dirtyRepository.markManyDirty).not.toHaveBeenCalled();
    expect(deps.jobProducer.enqueueRebuildJobs).toHaveBeenCalledWith([
      {
        userId: 5,
        dirtyVersion: "7",
        reason: UserProfileDirtyReason.UserUpdated,
        requestedAt: now.toISOString(),
      },
      {
        userId: 6,
        dirtyVersion: "8",
        reason: UserProfileDirtyReason.EmploymentUpdated,
        requestedAt: now.toISOString(),
      },
    ]);
  });
});
