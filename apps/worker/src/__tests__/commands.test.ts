import { describe, expect, mock, test } from "bun:test";
import { runUserProfileBackfillCommand } from "../commands/user-profile-backfill";
import {
  runSubjectAccessRepairCommand,
  runUserProfileRepairCommand,
} from "../commands/user-profile-repair";

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
    expect(info).toHaveBeenCalledWith({
      enqueued: 3,
      readiness: "not-verified",
    }, "user profile backfill jobs dispatched; run readiness gates after convergence");
  });

  test("repair command uses configured stale window by default", async () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const staleBefore = new Date("2026-06-30T23:55:00.000Z");
    const callOrder: string[] = [];
    const repairFailedOrStale = mock(async () => {
      callOrder.push("user-profile-repair");
      return { enqueued: 2, userIds: [1, 2] };
    });
    const repairPending = mock(async () => {
      callOrder.push("subject-access-repair");
      return {
        disabled: 1,
        enabled: 2,
        deferred: 3,
        failed: 0,
        stable: 0,
      };
    });
    const recoverPending = mock(async () => {
      callOrder.push("transition-recovery");
      return {
        deferred: 1,
        failed: 0,
        prepared: 2,
        rolledBack: 3,
      };
    });
    const reapStalePending = mock(async () => {
      callOrder.push("orphan-reap");
      return { rolledBack: 4 };
    });
    const inspectRepairBacklog = mock()
      .mockResolvedValueOnce({ count: 4, oldestAgeMs: 5_000 })
      .mockResolvedValueOnce({ count: 2, oldestAgeMs: 5_250 });
    const info = mock(() => {});

    await expect(runUserProfileRepairCommand(
      {
        maintenance: { repairFailedOrStale },
        subjectAccessRepairBacklog: { inspectRepairBacklog },
        subjectAccessRepair: { repairPending },
        subjectAccessTransitionReaper: { reapStalePending },
        subjectAccessTransitionRecovery: { recoverPending },
        clock: { nowDate: () => now },
        logger: { info },
        config: {
          limit: 10,
          repairStaleSeconds: 300,
          transitionStaleSeconds: 600,
        },
      },
    )).resolves.toEqual({
      enqueued: 2,
      userIds: [1, 2],
      subjectAccess: {
        disabled: 1,
        enabled: 2,
        deferred: 3,
        failed: 0,
        stable: 0,
      },
      transitionRecovery: {
        deferred: 1,
        failed: 0,
        prepared: 2,
        rolledBack: 3,
      },
      transitionReap: {
        rolledBack: 4,
      },
    });

    expect(reapStalePending).toHaveBeenCalledWith({
      limit: 10,
      staleAfterSeconds: 600,
    });
    expect(recoverPending).toHaveBeenCalledWith({ limit: 10 });
    expect(repairFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 10 });
    expect(repairPending).toHaveBeenCalledWith({ limit: 10 });
    expect(inspectRepairBacklog).toHaveBeenCalledTimes(2);
    expect(callOrder.slice(0, 2)).toEqual([
      "orphan-reap",
      "transition-recovery",
    ]);
    expect(new Set(callOrder.slice(2))).toEqual(new Set([
      "subject-access-repair",
      "user-profile-repair",
    ]));
    expect(info).toHaveBeenCalledWith({
      repairBacklogCount: 4,
      repairBacklogOldestAgeMs: 5_000,
    }, "Subject Access repair backlog observed before processing");
    expect(info).toHaveBeenCalledWith({
      limit: 10,
      staleAfterSeconds: 600,
    }, "Subject Access stale transition intent reap started");
    expect(info).toHaveBeenCalledWith({
      rolledBack: 4,
      limit: 10,
      staleAfterSeconds: 600,
    }, "Subject Access stale transition intents reaped");
    expect(info).toHaveBeenCalledWith(
      { enqueued: 2, userIds: [1, 2], staleBefore: staleBefore.toISOString(), limit: 10 },
      "user profile repair jobs enqueued",
    );
    expect(info).toHaveBeenCalledWith({
      deferred: 1,
      failed: 0,
      prepared: 2,
      rolledBack: 3,
      limit: 10,
    }, "Subject Access transition recovery backlog processed");
    expect(info).toHaveBeenCalledWith({
      disabled: 1,
      enabled: 2,
      deferred: 3,
      failed: 0,
      stable: 0,
      limit: 10,
      repairBacklogCount: 2,
      repairBacklogOldestAgeMs: 5_250,
    }, "Subject Access repair backlog processed");
  });

  test("repair command preserves explicit stale-before override", async () => {
    const staleBefore = new Date("2026-07-01T00:00:00.000Z");
    const repairFailedOrStale = mock(async () => ({ enqueued: 0, userIds: [] }));
    const repairPending = mock(async () => ({
      disabled: 0,
      enabled: 0,
      deferred: 0,
      failed: 0,
      stable: 0,
    }));
    const recoverPending = mock(async () => ({
      deferred: 0,
      failed: 0,
      prepared: 0,
      rolledBack: 0,
    }));
    const reapStalePending = mock(async () => ({ rolledBack: 0 }));

    await runUserProfileRepairCommand(
      {
        maintenance: { repairFailedOrStale },
        subjectAccessRepairBacklog: {
          inspectRepairBacklog: async () => ({ count: 0, oldestAgeMs: null }),
        },
        subjectAccessRepair: { repairPending },
        subjectAccessTransitionReaper: { reapStalePending },
        subjectAccessTransitionRecovery: { recoverPending },
        clock: { nowDate: () => new Date("2026-07-01T00:05:00.000Z") },
        logger: { info: mock(() => {}) },
        config: {
          limit: 10,
          repairStaleSeconds: 300,
          transitionStaleSeconds: 600,
        },
      },
      { staleBefore, limit: 5 },
    );

    expect(repairFailedOrStale).toHaveBeenCalledWith({ staleBefore, limit: 5 });
    expect(reapStalePending).toHaveBeenCalledWith({
      staleAfterSeconds: 600,
      limit: 5,
    });
    expect(recoverPending).toHaveBeenCalledWith({ limit: 5 });
    expect(repairPending).toHaveBeenCalledWith({ limit: 5 });
  });

  test("repair command can service only the Subject Access backlog", async () => {
    const callOrder: string[] = [];
    const reapStalePending = mock(async () => {
      callOrder.push("orphan-reap");
      return { rolledBack: 2 };
    });
    const repairPending = mock(async () => {
      callOrder.push("repair");
      return {
        disabled: 1,
        enabled: 2,
        deferred: 3,
        failed: 4,
        stable: 5,
      };
    });
    const recoverPending = mock(async () => {
      callOrder.push("transition-recovery");
      return {
        deferred: 6,
        failed: 0,
        prepared: 7,
        rolledBack: 8,
      };
    });
    const info = mock(() => {});
    const inspectRepairBacklog = mock()
      .mockResolvedValueOnce({
        count: 12,
        oldestAgeMs: 4_000,
        redisKey: "subject-access:v1:idx:repair",
        secret: "must-not-log",
        subjectIdentifier: "00000000-0000-4000-8000-000000000099",
        transitionId: "10000000-0000-4000-8000-000000000099",
      })
      .mockResolvedValueOnce({
        count: 5,
        oldestAgeMs: 4_250,
        redisKey: "subject-access:v1:idx:repair:age",
        secret: "still-must-not-log",
        subjectIdentifier: "00000000-0000-4000-8000-000000000098",
        transitionId: "10000000-0000-4000-8000-000000000098",
      });

    await expect(runSubjectAccessRepairCommand(
      {
        subjectAccessRepairBacklog: { inspectRepairBacklog },
        subjectAccessRepair: { repairPending },
        subjectAccessTransitionReaper: { reapStalePending },
        subjectAccessTransitionRecovery: { recoverPending },
        logger: { info },
        config: { limit: 10, transitionStaleSeconds: 300 },
      },
      { limit: 7 },
    )).resolves.toEqual({
      subjectAccess: {
        disabled: 1,
        enabled: 2,
        deferred: 3,
        failed: 4,
        stable: 5,
      },
      transitionRecovery: {
        deferred: 6,
        failed: 0,
        prepared: 7,
        rolledBack: 8,
      },
      transitionReap: {
        rolledBack: 2,
      },
    });

    expect(reapStalePending).toHaveBeenCalledWith({
      limit: 7,
      staleAfterSeconds: 300,
    });
    expect(recoverPending).toHaveBeenCalledWith({ limit: 7 });
    expect(repairPending).toHaveBeenCalledWith({ limit: 7 });
    expect(inspectRepairBacklog).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["orphan-reap", "transition-recovery", "repair"]);
    expect(info).toHaveBeenCalledTimes(5);
    expect(info).toHaveBeenCalledWith({
      repairBacklogCount: 12,
      repairBacklogOldestAgeMs: 4_000,
    }, "Subject Access repair backlog observed before processing");
    expect(info).toHaveBeenCalledWith({
      limit: 7,
      staleAfterSeconds: 300,
    }, "Subject Access stale transition intent reap started");
    expect(info).toHaveBeenCalledWith({
      rolledBack: 2,
      limit: 7,
      staleAfterSeconds: 300,
    }, "Subject Access stale transition intents reaped");
    expect(info).toHaveBeenCalledWith({
      deferred: 6,
      failed: 0,
      prepared: 7,
      rolledBack: 8,
      limit: 7,
    }, "Subject Access transition recovery backlog processed");
    expect(info).toHaveBeenCalledWith({
      disabled: 1,
      enabled: 2,
      deferred: 3,
      failed: 4,
      stable: 5,
      limit: 7,
      repairBacklogCount: 5,
      repairBacklogOldestAgeMs: 4_250,
    }, "Subject Access repair backlog processed");
    expect(JSON.stringify(info.mock.calls)).not.toContain("must-not-log");
    expect(JSON.stringify(info.mock.calls)).not.toContain("000000000099");
    expect(JSON.stringify(info.mock.calls)).not.toContain("idx:repair:age");
  });

  test("repair command continues recovery when backlog metrics are unavailable", async () => {
    const callOrder: string[] = [];
    const metricsError = new Error("redis://secret@repair-metrics unavailable");
    const inspectRepairBacklog = mock(async () => {
      callOrder.push("observe-backlog");
      throw metricsError;
    });
    const reapStalePending = mock(async () => {
      callOrder.push("orphan-reap");
      return { rolledBack: 1 };
    });
    const recoverPending = mock(async () => {
      callOrder.push("transition-recovery");
      return {
        deferred: 0,
        failed: 0,
        prepared: 1,
        rolledBack: 0,
      };
    });
    const repairPending = mock(async () => {
      callOrder.push("repair");
      return {
        disabled: 0,
        enabled: 1,
        deferred: 0,
        failed: 0,
        stable: 0,
      };
    });
    const info = mock((_data: Record<string, unknown>, _message: string) => {});

    await expect(runSubjectAccessRepairCommand({
      subjectAccessRepairBacklog: { inspectRepairBacklog },
      subjectAccessRepair: { repairPending },
      subjectAccessTransitionReaper: { reapStalePending },
      subjectAccessTransitionRecovery: { recoverPending },
      logger: { info },
      config: { limit: 10, transitionStaleSeconds: 300 },
    })).resolves.toMatchObject({
      subjectAccess: { enabled: 1 },
      transitionReap: { rolledBack: 1 },
      transitionRecovery: { prepared: 1 },
    });

    expect(callOrder).toEqual([
      "orphan-reap",
      "observe-backlog",
      "transition-recovery",
      "repair",
      "observe-backlog",
    ]);
    expect(info.mock.calls.filter(([, message]) =>
      message === "Subject Access repair backlog observation unavailable"))
      .toHaveLength(2);
    expect(JSON.stringify(info.mock.calls)).not.toContain("redis://");
  });

  test("retrying after a post-reap crash does not duplicate the released intent", async () => {
    const crash = new Error("crashed after transition reap");
    const reapStalePending = mock()
      .mockResolvedValueOnce({ rolledBack: 1 })
      .mockResolvedValueOnce({ rolledBack: 0 });
    const recoverPending = mock()
      .mockRejectedValueOnce(crash)
      .mockResolvedValueOnce({
        deferred: 0,
        failed: 0,
        prepared: 0,
        rolledBack: 0,
      });
    const repairPending = mock(async () => ({
      disabled: 0,
      enabled: 0,
      deferred: 0,
      failed: 0,
      stable: 0,
    }));
    const info = mock((_data: Record<string, unknown>, _message: string) => {});
    const deps = {
      subjectAccessRepairBacklog: {
        inspectRepairBacklog: mock(async () => ({ count: 0, oldestAgeMs: null })),
      },
      subjectAccessRepair: { repairPending },
      subjectAccessTransitionReaper: { reapStalePending },
      subjectAccessTransitionRecovery: { recoverPending },
      logger: { info },
      config: { limit: 10, transitionStaleSeconds: 300 },
    };

    await expect(runSubjectAccessRepairCommand(deps)).rejects.toBe(crash);
    await expect(runSubjectAccessRepairCommand(deps)).resolves.toMatchObject({
      transitionReap: { rolledBack: 0 },
    });

    expect(reapStalePending).toHaveBeenCalledTimes(2);
    expect(recoverPending).toHaveBeenCalledTimes(2);
    expect(repairPending).toHaveBeenCalledTimes(1);
    expect(info.mock.calls.filter(([, message]) =>
      message === "Subject Access repair backlog observed before processing"))
      .toHaveLength(2);
    expect(info.mock.calls.filter(([, message]) =>
      message === "Subject Access repair backlog processed"))
      .toHaveLength(1);
  });
});
