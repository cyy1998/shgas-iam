import { UserProfileDirtyReason, UserProfileScopeType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileDirtyMarker } from "../dirty-marker";

const now = new Date("2026-07-01T00:00:00.000Z");

function createDeps() {
  return {
    dirtyRepository: {
      markManyDirty: mock(async (inputs: unknown[]) => inputs),
    },
    scopeRepository: {
      resolveUserIds: mock(async () => [2, 1, 2]),
    },
    jobProducer: {
      buildRebuildJobId: mock((userId: number) => `rebuild-user-profile:${userId}`),
      enqueueRebuildJob: mock(async (input: { userId: number }) => ({
        jobId: `rebuild-user-profile:${input.userId}`,
      })),
    },
    clock: {
      nowDate: mock(() => now),
    },
  };
}

function createAfterCommit() {
  const tasks: Array<() => Promise<void> | void> = [];
  return {
    afterCommit: {
      bestEffort: mock((_name: string, callback: () => Promise<void> | void) => {
        tasks.push(callback);
      }),
    },
    tasks,
  };
}

describe("createUserProfileDirtyMarker", () => {
  test("marks unique users dirty and registers afterCommit rebuild wake-up", async () => {
    const deps = createDeps();
    const afterCommit = createAfterCommit();
    const marker = createUserProfileDirtyMarker(deps);

    await expect(marker.markUsersDirty({
      userIds: [1, 2, 1],
      reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: afterCommit.afterCommit,
      requestId: "req-1",
      traceId: "trace-1",
    })).resolves.toEqual({ marked: 2, userIds: [1, 2] });

    expect(deps.dirtyRepository.markManyDirty).toHaveBeenCalledWith([
      {
        userId: 1,
        reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:1",
      },
      {
        userId: 2,
        reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:2",
      },
    ]);
    expect(afterCommit.afterCommit.bestEffort).toHaveBeenCalledWith(
      "user_profile.rebuild.wake_up",
      expect.any(Function),
    );

    await afterCommit.tasks[0]!();
    expect(deps.jobProducer.enqueueRebuildJob).toHaveBeenCalledWith({
      userId: 1,
      reason: UserProfileDirtyReason.UserUpdated,
      requestedAt: now.toISOString(),
      requestId: "req-1",
      traceId: "trace-1",
    });
    expect(deps.jobProducer.enqueueRebuildJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 2 }));
  });

  test("resolves scopes inside the transaction before marking users dirty", async () => {
    const deps = createDeps();
    const afterCommit = createAfterCommit();
    const marker = createUserProfileDirtyMarker(deps);

    await marker.markScopeDirty({
      scope: { scopeType: UserProfileScopeType.OrganizationId, scopeId: 10 },
      reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
      afterCommit: afterCommit.afterCommit,
    });

    expect(deps.scopeRepository.resolveUserIds).toHaveBeenCalledWith({
      scopeType: UserProfileScopeType.OrganizationId,
      scopeId: 10,
    });
    expect(deps.dirtyRepository.markManyDirty).toHaveBeenCalledWith([
      {
        userId: 2,
        reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:2",
      },
      {
        userId: 1,
        reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
        dirtyAt: now,
        lastJobId: "rebuild-user-profile:1",
      },
    ]);
  });

  test("does not register wake-up when there are no target users", async () => {
    const deps = createDeps();
    deps.scopeRepository.resolveUserIds.mockResolvedValueOnce([]);
    const afterCommit = createAfterCommit();
    const marker = createUserProfileDirtyMarker(deps);

    await expect(marker.markScopeDirty({
      scope: { scopeType: UserProfileScopeType.PositionId, scopeId: 20 },
      reasonCodes: [UserProfileDirtyReason.PositionUpdated],
      afterCommit: afterCommit.afterCommit,
    })).resolves.toEqual({ marked: 0, userIds: [] });

    expect(deps.dirtyRepository.markManyDirty).not.toHaveBeenCalled();
    expect(afterCommit.afterCommit.bestEffort).not.toHaveBeenCalled();
  });
});
