import { UserProfileDirtyReason, UserProfileScopeType, UserStatus } from "@iam/contracts";
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
    },
    dirtyRepository: {
      claimForProcessing: mock(async () => ({ userId: 1 })),
      markProcessed: mock(async () => ({ userId: 1 })),
      markFailed: mock(async () => ({ userId: 1 })),
      markDirty: mock(async (input: unknown) => input),
      markManyDirty: mock(async (input: unknown) => input),
      scanFailedOrStale: mock(async () => [{ userId: 5 }, { userId: 6 }]),
    },
    scopeRepository: {
      resolveUserIds: mock(async () => [1, 2]),
      scanAllUserIds: mock(async () => [] as number[]),
    },
    builder: {
      buildOne: mock(async (userId: number) => builtProfile(userId)),
    },
    jobProducer: {
      buildRebuildJobId: mock((userId: number) => `rebuild-user-profile:${userId}`),
      enqueueRebuildJob: mock(async (input: { userId: number }) => ({ jobId: `rebuild-user-profile:${input.userId}` })),
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
      reason: UserProfileDirtyReason.UserUpdated,
    }, { jobId: "job-1" })).resolves.toEqual({ status: "rebuilt", userId: 1 });

    expect(deps.dirtyRepository.claimForProcessing).toHaveBeenCalledWith({ userId: 1, now, jobId: "job-1" });
    expect(deps.profileRepository.upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    expect(deps.dirtyRepository.markProcessed).toHaveBeenCalledWith(1, now);
  });

  test("no-ops rebuild jobs when no pending or failed dirty row exists", async () => {
    const deps = createDeps({
      dirtyRepository: {
        claimForProcessing: mock(async () => null),
        markProcessed: mock(async () => null),
        markFailed: mock(async () => null),
      },
    });
    const service = createUserProfileWorkerService(deps);

    await expect(service.processRebuildUserProfile({
      userId: 1,
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({ status: "skipped", userId: 1 });

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
      reason: UserProfileDirtyReason.UserUpdated,
    })).rejects.toThrow("builder failed");

    expect(deps.dirtyRepository.markFailed).toHaveBeenCalledWith(1, "builder failed", now);
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
    expect(deps.jobProducer.enqueueRebuildJob).toHaveBeenCalledTimes(6);
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
    expect(deps.dirtyRepository.markManyDirty).toHaveBeenCalledWith([
      {
        userId: 5,
        reasonCodes: [UserProfileDirtyReason.ManualRebuild],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:5",
      },
      {
        userId: 6,
        reasonCodes: [UserProfileDirtyReason.ManualRebuild],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:6",
      },
    ]);
  });
});
