import type { UserProfileMaintenanceRepairRow } from "../../src/worker";
import { UserProfileDirtyReason, UserProfileDirtyStatus, UserProfileJobName } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileJobProducer } from "../../src/producer";
import { createUserProfileWorkerMaintenance } from "../../src/worker";

const now = new Date("2026-07-25T09:00:00.000Z");

function createFixture(pages: number[][] = [[]]) {
  let pageIndex = 0;
  const scanInputs: Array<{ afterUserId?: number; limit: number }> = [];
  const scanUserIds = mock(async (input: { afterUserId?: number; limit: number }) => {
    scanInputs.push(input);
    return pages[pageIndex++] ?? [];
  });
  const persistedBatches: Array<Array<{
    userId: number;
    reasonCodes: UserProfileDirtyReason[];
    dirtyAt: Date;
  }>> = [];
  const versions = new Map<number, number>();
  const markManyDirty = mock(async (inputs: Array<{
    userId: number;
    reasonCodes: UserProfileDirtyReason[];
    dirtyAt: Date;
  }>) => {
    persistedBatches.push(inputs);
    return inputs.map((input) => {
      const version = (versions.get(input.userId) ?? 0) + 1;
      versions.set(input.userId, version);
      return {
        ...input,
        dirtyVersion: String(version),
      };
    });
  });
  const queuedBatches: unknown[][] = [];
  const queue = {
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => {
      queuedBatches.push(jobs);
      return jobs.map(job => ({ id: job.opts.jobId }));
    }),
  };
  const maintenance = createUserProfileWorkerMaintenance({
    userRepository: {
      scanUserIds,
    },
    dirtyRepository: {
      markManyDirty,
      scanFailedOrStale: mock(async () => []),
      resetStaleProcessing: mock(async () => null),
    },
    jobProducer: {
      enqueueRebuildJobs: createUserProfileJobProducer(queue).enqueueRebuildJobs,
    },
    clock: {
      nowDate: () => now,
    },
    config: {
      backfillBatchSize: 2,
    },
  });

  return {
    maintenance,
    markManyDirty,
    persistedBatches,
    queuedBatches,
    scanInputs,
  };
}

interface ResetStaleProcessingInput {
  userId: number;
  dirtyVersion: string;
  staleBefore: Date;
  now: Date;
}

function createRepairFixture(
  rows: UserProfileMaintenanceRepairRow[],
  reset: (input: ResetStaleProcessingInput) => Promise<UserProfileMaintenanceRepairRow | null> = async () => null,
) {
  const scanInputs: unknown[] = [];
  const scanFailedOrStale = mock(async (input: unknown) => {
    scanInputs.push(input);
    return rows;
  });
  const markManyDirty = mock(async () => []);
  const resetStaleProcessing = mock(reset);
  const queuedBatches: unknown[][] = [];
  const queue = {
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => {
      queuedBatches.push(jobs);
      return jobs.map(job => ({ id: job.opts.jobId }));
    }),
  };
  const maintenance = createUserProfileWorkerMaintenance({
    userRepository: {
      scanUserIds: mock(async () => []),
    },
    dirtyRepository: {
      markManyDirty,
      scanFailedOrStale,
      resetStaleProcessing,
    },
    jobProducer: {
      enqueueRebuildJobs: createUserProfileJobProducer(queue).enqueueRebuildJobs,
    },
    clock: {
      nowDate: () => now,
    },
    config: {
      backfillBatchSize: 2,
    },
  });

  return {
    maintenance,
    markManyDirty,
    queuedBatches,
    resetStaleProcessing,
    scanInputs,
  };
}

describe("UserProfileWorkerMaintenance", () => {
  test("returns zero without dirtying or enqueueing when the user store is empty", async () => {
    const fixture = createFixture();

    await expect(fixture.maintenance.backfillAllUsers()).resolves.toEqual({ enqueued: 0 });

    expect(fixture.markManyDirty).not.toHaveBeenCalled();
    expect(fixture.queuedBatches).toEqual([]);
  });

  test("continues after a full batch and immediately enqueues the final tail", async () => {
    const fixture = createFixture([[1, 2], [3]]);

    await expect(fixture.maintenance.backfillAllUsers()).resolves.toEqual({ enqueued: 3 });

    expect(fixture.scanInputs).toEqual([
      { afterUserId: undefined, limit: 2 },
      { afterUserId: 2, limit: 2 },
    ]);
    expect(fixture.persistedBatches).toEqual([
      [
        { userId: 1, reasonCodes: [UserProfileDirtyReason.Backfill], dirtyAt: now },
        { userId: 2, reasonCodes: [UserProfileDirtyReason.Backfill], dirtyAt: now },
      ],
      [
        { userId: 3, reasonCodes: [UserProfileDirtyReason.Backfill], dirtyAt: now },
      ],
    ]);
    expect(fixture.queuedBatches).toEqual([
      [
        {
          name: UserProfileJobName.RebuildUserProfile,
          data: {
            userId: 1,
            dirtyVersion: "1",
            reason: "backfill",
            requestedAt: "2026-07-25T09:00:00.000Z",
          },
          opts: { jobId: "rebuild-user-profile|1|1" },
        },
        {
          name: UserProfileJobName.RebuildUserProfile,
          data: {
            userId: 2,
            dirtyVersion: "1",
            reason: "backfill",
            requestedAt: "2026-07-25T09:00:00.000Z",
          },
          opts: { jobId: "rebuild-user-profile|2|1" },
        },
      ],
      [
        {
          name: UserProfileJobName.RebuildUserProfile,
          data: {
            userId: 3,
            dirtyVersion: "1",
            reason: "backfill",
            requestedAt: "2026-07-25T09:00:00.000Z",
          },
          opts: { jobId: "rebuild-user-profile|3|1" },
        },
      ],
    ]);
  });

  test("deduplicates users across full pages and reports the unique enqueue total", async () => {
    const fixture = createFixture([[1, 2], [2, 3], []]);

    await expect(fixture.maintenance.backfillAllUsers()).resolves.toEqual({ enqueued: 3 });

    expect(fixture.scanInputs).toEqual([
      { afterUserId: undefined, limit: 2 },
      { afterUserId: 2, limit: 2 },
      { afterUserId: 3, limit: 2 },
    ]);
    expect(fixture.persistedBatches.map(batch => batch.map(row => row.userId))).toEqual([
      [1, 2],
      [3],
    ]);
    expect(fixture.queuedBatches.map(batch => batch.map((job: any) => ({
      userId: job.data.userId,
      dirtyVersion: job.data.dirtyVersion,
      jobId: job.opts.jobId,
    })))).toEqual([
      [
        { userId: 1, dirtyVersion: "1", jobId: "rebuild-user-profile|1|1" },
        { userId: 2, dirtyVersion: "1", jobId: "rebuild-user-profile|2|1" },
      ],
      [
        { userId: 3, dirtyVersion: "1", jobId: "rebuild-user-profile|3|1" },
      ],
    ]);
  });

  test("reports the bulk delivery result instead of assuming every dirty row was enqueued", async () => {
    const maintenance = createUserProfileWorkerMaintenance({
      userRepository: {
        scanUserIds: mock(async () => [1, 2]),
      },
      dirtyRepository: {
        markManyDirty: mock(async (inputs: Array<{
          userId: number;
          reasonCodes: UserProfileDirtyReason[];
          dirtyAt: Date;
        }>) => inputs.map((input, index) => ({
          ...input,
          dirtyVersion: String(index + 1),
        }))),
        scanFailedOrStale: mock(async () => []),
        resetStaleProcessing: mock(async () => null),
      },
      jobProducer: {
        enqueueRebuildJobs: mock(async () => ({
          enqueued: 1,
          jobIds: ["rebuild-user-profile|1|1"],
        })),
      },
      clock: {
        nowDate: () => now,
      },
      config: {
        backfillBatchSize: 3,
      },
    });

    await expect(maintenance.backfillAllUsers()).resolves.toEqual({ enqueued: 1 });
  });

  test("repairs failed and stale pending rows at their current dirty versions", async () => {
    const staleBefore = new Date("2026-07-25T08:00:00.000Z");
    const fixture = createRepairFixture([
      {
        userId: 5,
        dirtyVersion: "7",
        reasonCodes: [UserProfileDirtyReason.UserUpdated],
        status: UserProfileDirtyStatus.Failed,
        dirtyAt: new Date("2026-07-25T08:30:00.000Z"),
        processingStartedAt: null,
      },
      {
        userId: 6,
        dirtyVersion: "11",
        reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
        status: UserProfileDirtyStatus.Pending,
        dirtyAt: new Date("2026-07-25T07:30:00.000Z"),
        processingStartedAt: null,
      },
    ]);

    await expect(fixture.maintenance.repairFailedOrStale({ staleBefore })).resolves.toEqual({
      enqueued: 2,
      userIds: [5, 6],
    });

    expect(fixture.scanInputs).toEqual([{ staleBefore, limit: 2 }]);
    expect(fixture.markManyDirty).not.toHaveBeenCalled();
    expect(fixture.resetStaleProcessing).not.toHaveBeenCalled();
    expect(fixture.queuedBatches).toEqual([[
      {
        name: UserProfileJobName.RebuildUserProfile,
        data: {
          userId: 5,
          dirtyVersion: "7",
          reason: "user-updated",
          requestedAt: "2026-07-25T09:00:00.000Z",
        },
        opts: { jobId: "rebuild-user-profile|5|7" },
      },
      {
        name: UserProfileJobName.RebuildUserProfile,
        data: {
          userId: 6,
          dirtyVersion: "11",
          reason: "employment-updated",
          requestedAt: "2026-07-25T09:00:00.000Z",
        },
        opts: { jobId: "rebuild-user-profile|6|11" },
      },
    ]]);
  });

  test("re-enqueues only stale processing rows that win the reset CAS", async () => {
    const staleBefore = new Date("2026-07-25T08:00:00.000Z");
    const rows: UserProfileMaintenanceRepairRow[] = [
      {
        userId: 7,
        dirtyVersion: "4",
        reasonCodes: [UserProfileDirtyReason.RoleUpdated],
        status: UserProfileDirtyStatus.Processing,
        dirtyAt: new Date("2026-07-25T06:30:00.000Z"),
        processingStartedAt: new Date("2026-07-25T07:00:00.000Z"),
      },
      {
        userId: 8,
        dirtyVersion: "5",
        reasonCodes: [UserProfileDirtyReason.PositionUpdated],
        status: UserProfileDirtyStatus.Processing,
        dirtyAt: new Date("2026-07-25T06:30:00.000Z"),
        processingStartedAt: new Date("2026-07-25T07:15:00.000Z"),
      },
      {
        userId: 9,
        dirtyVersion: "6",
        reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
        status: UserProfileDirtyStatus.Processing,
        dirtyAt: new Date("2026-07-25T06:30:00.000Z"),
        processingStartedAt: new Date("2026-07-25T08:30:00.000Z"),
      },
    ];
    const fixture = createRepairFixture(rows, async (input) => {
      if (input.userId !== 7)
        return null;
      return {
        ...rows[0]!,
        status: UserProfileDirtyStatus.Pending,
        processingStartedAt: null,
      };
    });

    await expect(fixture.maintenance.repairFailedOrStale({ staleBefore })).resolves.toEqual({
      enqueued: 1,
      userIds: [7],
    });

    expect(fixture.resetStaleProcessing.mock.calls.map(call => call[0])).toEqual([
      { userId: 7, dirtyVersion: "4", staleBefore, now },
      { userId: 8, dirtyVersion: "5", staleBefore, now },
    ]);
    expect(fixture.markManyDirty).not.toHaveBeenCalled();
    expect(fixture.queuedBatches).toEqual([[
      {
        name: UserProfileJobName.RebuildUserProfile,
        data: {
          userId: 7,
          dirtyVersion: "4",
          reason: "role-updated",
          requestedAt: "2026-07-25T09:00:00.000Z",
        },
        opts: { jobId: "rebuild-user-profile|7|4" },
      },
    ]]);
  });
});
