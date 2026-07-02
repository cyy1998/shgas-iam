import { describe, expect, mock, test } from "bun:test";
import { runUserProfileBackfillCommand } from "../commands/user-profile-backfill";
import { runUserProfileRepairCommand } from "../commands/user-profile-repair";

describe("user-profile commands", () => {
  test("backfill command delegates to dirty-and-enqueue service path", async () => {
    const backfillAllUsers = mock(async () => ({ enqueued: 3 }));

    await expect(runUserProfileBackfillCommand({
      workerService: { backfillAllUsers },
      logger: { info: mock(() => {}) },
      config: { batchSize: 25 },
    })).resolves.toEqual({ enqueued: 3 });

    expect(backfillAllUsers).toHaveBeenCalledWith({ batchSize: 25 });
  });

  test("repair command delegates to dirty-and-enqueue service path", async () => {
    const staleBefore = new Date("2026-07-01T00:00:00.000Z");
    const repairFailedOrStale = mock(async () => ({ enqueued: 2, userIds: [1, 2] }));

    await expect(runUserProfileRepairCommand(
      {
        workerService: { repairFailedOrStale },
        clock: { nowDate: () => staleBefore },
        logger: { info: mock(() => {}) },
        config: { limit: 10 },
      },
    )).resolves.toEqual({ enqueued: 2, userIds: [1, 2] });

    expect(repairFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 10 });
  });
});
