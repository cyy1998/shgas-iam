import { describe, expect, mock, test } from "bun:test";
import { createRedisSubjectAccessStore } from "../redis-store";
import { createInMemorySubjectAccessStore } from "../testing";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const transitionId = "10000000-0000-4000-8000-000000000001";

describe("Subject Access transition recovery backlog", () => {
  test("parses a production Redis recovery lease with its independent fence", async () => {
    const evalScript = mock(async () => [
      subjectIdentifier,
      transitionId,
      "worker-a",
      "3",
      "250",
    ]);
    const store = createRedisSubjectAccessStore({
      redis: {
        eval: evalScript,
        get: async () => null,
      },
      transitionRecoveryDelayMs: 50,
    });

    await expect(store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    })).resolves.toEqual({
      subjectIdentifier,
      transitionId,
      leaseToken: "worker-a",
      fence: 3,
      leaseUntil: 250,
    });
  });

  test("leases only stale mutating transitions and fences a crashed owner", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier,
      state: "enabled",
      transitionId: "20000000-0000-4000-8000-000000000001",
      updatedAt: "2026-07-31T08:00:00.000Z",
    }], {
      clock: { now: () => redisNow },
      transitionRecoveryDelayMs: 50,
    });
    await store.beginBlocking({
      blockingRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "blocking",
        transitionId,
        updatedAt: "2026-07-31T08:05:00.000Z",
      }),
      subjectIdentifier,
      transitionId,
    });

    redisNow = 149;
    await expect(store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    })).resolves.toBeNull();

    redisNow = 150;
    const crashedLease = await store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    });
    expect(crashedLease).toMatchObject({
      fence: 1,
      leaseUntil: 250,
      leaseToken: "worker-a",
      subjectIdentifier,
      transitionId,
    });

    redisNow = 250;
    await expect(store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-b",
    })).resolves.toMatchObject({
      fence: 2,
      leaseUntil: 350,
      leaseToken: "worker-b",
    });
  });

  test("rejects an old recovery owner and prepares only the exact committed target", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier,
      state: "enabled",
      transitionId: "20000000-0000-4000-8000-000000000001",
      updatedAt: "2026-07-31T08:00:00.000Z",
    }], {
      clock: { now: () => redisNow },
      transitionRecoveryDelayMs: 0,
    });
    await store.beginBlocking({
      blockingRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "blocking",
        transitionId,
        updatedAt: "2026-07-31T08:05:00.000Z",
      }),
      subjectIdentifier,
      transitionId,
    });
    const oldLease = await store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    });
    if (oldLease === null)
      throw new Error("expected old recovery lease");
    redisNow = 200;
    const currentLease = await store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-b",
    });
    if (currentLease === null)
      throw new Error("expected current recovery lease");

    await expect(store.reconcileTransitionRecovery({
      lease: oldLease,
      resolution: { status: "committed", targetState: "disabled" },
    })).resolves.toBe("stale_lease");
    await expect(store.reconcileTransitionRecovery({
      lease: currentLease,
      resolution: { status: "committed", targetState: "disabled" },
    })).resolves.toBe("prepared");
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "authority-worker",
    })).resolves.toMatchObject({
      subjectIdentifier,
      targetState: "disabled",
      transitionId,
    });
  });

  test("idempotently restores the previous record from an authoritative rollback", async () => {
    const previousTransitionId = "20000000-0000-4000-8000-000000000001";
    const store = createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier,
      state: "enabled",
      transitionId: previousTransitionId,
      updatedAt: "2026-07-31T08:00:00.000Z",
    }], {
      clock: { now: () => 100 },
      transitionRecoveryDelayMs: 0,
    });
    await store.beginBlocking({
      blockingRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "blocking",
        transitionId,
        updatedAt: "2026-07-31T08:05:00.000Z",
      }),
      subjectIdentifier,
      transitionId,
    });
    const lease = await store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    });
    if (lease === null)
      throw new Error("expected recovery lease");

    await expect(store.reconcileTransitionRecovery({
      lease,
      resolution: { status: "rolled_back" },
    })).resolves.toBe("rolled_back");
    await expect(store.read(subjectIdentifier)).resolves.toContain(
      previousTransitionId,
    );
    await expect(store.claimTransitionRecovery({
      leaseDurationMs: 100,
      leaseToken: "worker-b",
    })).resolves.toBeNull();
  });
});
