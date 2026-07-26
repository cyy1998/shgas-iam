import { describe, expect, mock, test } from "bun:test";
import { runUserProfileBackfillCommand } from "../commands/user-profile-backfill";
import { runUserProfileRepairCommand } from "../commands/user-profile-repair";

describe("user-profile commands", () => {
  test("backfill command delegates to worker maintenance", async () => {
    const backfillAllUsers = mock(async () => ({ enqueued: 3 }));
    const info = mock(() => {});

    await expect(runUserProfileBackfillCommand({
      maintenance: { backfillAllUsers },
      logger: { info },
      config: { batchSize: 25 },
    })).resolves.toEqual({ enqueued: 3 });

    expect(backfillAllUsers).toHaveBeenCalledWith({ batchSize: 25 });
    expect(info).toHaveBeenCalledWith({ enqueued: 3 }, "user profile backfill jobs enqueued");
  });

  test("repair command uses configured stale window by default", async () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const staleBefore = new Date("2026-06-30T23:55:00.000Z");
    const repairFailedOrStale = mock(async () => ({ enqueued: 2, userIds: [1, 2] }));
    const info = mock(() => {});

    await expect(runUserProfileRepairCommand(
      {
        maintenance: { repairFailedOrStale },
        clock: { nowDate: () => now },
        logger: { info },
        config: { limit: 10, repairStaleSeconds: 300 },
      },
    )).resolves.toEqual({ enqueued: 2, userIds: [1, 2] });

    expect(repairFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 10 });
    expect(info).toHaveBeenCalledWith(
      { enqueued: 2, userIds: [1, 2], staleBefore: staleBefore.toISOString(), limit: 10 },
      "user profile repair jobs enqueued",
    );
  });

  test("repair command preserves explicit stale-before override", async () => {
    const staleBefore = new Date("2026-07-01T00:00:00.000Z");
    const repairFailedOrStale = mock(async () => ({ enqueued: 0, userIds: [] }));

    await runUserProfileRepairCommand(
      {
        maintenance: { repairFailedOrStale },
        clock: { nowDate: () => new Date("2026-07-01T00:05:00.000Z") },
        logger: { info: mock(() => {}) },
        config: { limit: 10, repairStaleSeconds: 300 },
      },
      { staleBefore, limit: 5 },
    );

    expect(repairFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 5 });
  });
});
