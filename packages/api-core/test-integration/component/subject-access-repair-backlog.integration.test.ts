import { describe, expect, mock, test } from "bun:test";
import { createRedisSubjectAccessStore } from "../../src/subject-access/storage/redis-store";
import { createInMemorySubjectAccessStore } from "../../src/subject-access/testing";

const subjects = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
] as const;
const transitions = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
] as const;

function enabledRecord(subjectIdentifier: string) {
  return {
    version: 1 as const,
    subjectIdentifier,
    transitionId: subjectIdentifier.replace(
      "00000000-0000",
      "20000000-0000",
    ),
    state: "enabled" as const,
    updatedAt: "2026-07-31T08:00:00.000Z",
  };
}

function blockingRecord(subjectIdentifier: string, transitionId: string) {
  return JSON.stringify({
    version: 1,
    subjectIdentifier,
    state: "blocking",
    transitionId,
    updatedAt: "2026-07-31T08:05:00.000Z",
  });
}

async function begin(
  store: ReturnType<typeof createInMemorySubjectAccessStore>,
  subjectIdentifier: string,
  transitionId: string,
) {
  await expect(store.beginBlocking({
    blockingRecord: blockingRecord(subjectIdentifier, transitionId),
    subjectIdentifier,
    transitionId,
  })).resolves.toEqual({
    status: "transitioned",
    previousCommittedTransitionId: enabledRecord(subjectIdentifier).transitionId,
  });
}

async function prepare(
  store: ReturnType<typeof createInMemorySubjectAccessStore>,
  subjectIdentifier: string,
  transitionId: string,
  targetState: "enabled" | "disabled" = "enabled",
) {
  await expect(store.prepareRepair({
    subjectIdentifier,
    targetState,
    transitionId,
  })).resolves.toBe("prepared");
}

describe("Subject Access repair backlog", () => {
  test("reports an empty backlog and the age of its oldest repairable subject", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => redisNow } },
    );

    await expect(store.inspectRepairBacklog()).resolves.toEqual({
      count: 0,
      oldestAgeMs: null,
    });

    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!);
    redisNow = 175;

    await expect(store.inspectRepairBacklog()).resolves.toEqual({
      count: 1,
      oldestAgeMs: 75,
    });
  });

  test("keeps the first-entry age through leases and never reports a negative age", async () => {
    let redisNow = 200;
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => redisNow } },
    );
    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!);

    redisNow = 250;
    const lease = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "metrics-owner",
    });
    if (lease === null)
      throw new Error("expected repair lease");
    await store.rescheduleRepairSubject({ lease, retryDelayMs: 5_000 });
    await expect(store.inspectRepairBacklog()).resolves.toEqual({
      count: 1,
      oldestAgeMs: 50,
    });

    redisNow = 150;
    await expect(store.inspectRepairBacklog()).resolves.toEqual({
      count: 1,
      oldestAgeMs: 0,
    });
  });

  test("continues claiming after a Redis script batch only cleaned stale index entries", async () => {
    let claimAttempt = 0;
    const evalScript = mock(async () => {
      claimAttempt += 1;
      return claimAttempt === 1
        ? ["retry_after_cleanup"]
        : [
            subjects[0],
            transitions[0],
            "enabled",
            "worker-a",
            "1",
            "200",
          ];
    });
    const store = createRedisSubjectAccessStore({
      redis: {
        eval: evalScript,
        get: async () => null,
      },
    });

    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    })).resolves.toMatchObject({
      subjectIdentifier: subjects[0],
      transitionId: transitions[0],
    });
    expect(evalScript).toHaveBeenCalledTimes(2);
  });

  test("reads a redacted backlog metric snapshot from the Redis adapter", async () => {
    const evalScript = mock(async () => ["2", "75"]);
    const store = createRedisSubjectAccessStore({
      keyPrefix: "iam:test:subject-access:",
      redis: {
        eval: evalScript,
        get: async () => null,
      },
    });

    await expect(store.inspectRepairBacklog()).resolves.toEqual({
      count: 2,
      oldestAgeMs: 75,
    });
    expect(evalScript).toHaveBeenCalledWith(
      expect.stringContaining("subject-access:inspect-repair-backlog"),
      2,
      "iam:test:subject-access:idx:repair",
      "iam:test:subject-access:idx:repair:age",
    );
  });

  test("never claims a mutating transition before its database commit is confirmed", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => redisNow } },
    );
    await begin(store, subjects[0]!, transitions[0]!);

    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    })).resolves.toBeNull();

    await prepare(store, subjects[0]!, transitions[0]!);
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    })).resolves.toMatchObject({
      subjectIdentifier: subjects[0],
      targetState: "enabled",
      transitionId: transitions[0],
    });
    redisNow += 1;
  });

  test("uses the store clock and retries a crashed lease only after expiry", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => redisNow } },
    );
    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!);

    const first = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
    });
    expect(first).toMatchObject({ leaseUntil: 200, fence: 1 });
    redisNow = 199;
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-b",
    })).resolves.toBeNull();
    redisNow = 200;
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-b",
    })).resolves.toMatchObject({
      leaseToken: "worker-b",
      leaseUntil: 300,
      fence: 2,
    });
  });

  test("targeted publication nudge bypasses backoff but never steals an active lease", async () => {
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => 100 } },
    );
    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!);

    const activeLease = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "worker-a",
      subjectIdentifier: subjects[0],
    });
    if (activeLease === null)
      throw new Error("expected active lease");
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "publisher-too-early",
      subjectIdentifier: subjects[0],
    })).resolves.toBeNull();

    await store.rescheduleRepairSubject({
      lease: activeLease,
      retryDelayMs: 5_000,
    });
    await expect(store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "publisher-current-facts",
      subjectIdentifier: subjects[0],
    })).resolves.toMatchObject({
      leaseToken: "publisher-current-facts",
      subjectIdentifier: subjects[0],
    });
  });

  test("atomically gives concurrent workers disjoint one-at-a-time claims", async () => {
    const store = createInMemorySubjectAccessStore(
      subjects.map(enabledRecord),
      { clock: { now: () => 100 } },
    );
    await Promise.all(subjects.map(async (subjectIdentifier, index) => {
      await begin(store, subjectIdentifier, transitions[index]!);
      await prepare(store, subjectIdentifier, transitions[index]!);
    }));

    const claims = await Promise.all([
      store.claimRepairSubject({ leaseDurationMs: 100, leaseToken: "worker-a" }),
      store.claimRepairSubject({ leaseDurationMs: 100, leaseToken: "worker-b" }),
      store.claimRepairSubject({ leaseDurationMs: 100, leaseToken: "worker-c" }),
      store.claimRepairSubject({ leaseDurationMs: 100, leaseToken: "worker-d" }),
    ]);

    expect(claims.map(claim => claim?.subjectIdentifier)).toEqual([...subjects]);
    expect(new Set(claims.map(claim => claim?.subjectIdentifier)).size).toBe(subjects.length);
  });

  test("rejects every late operation from an expired owner after re-claim", async () => {
    let redisNow = 100;
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!)],
      { clock: { now: () => redisNow } },
    );
    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!, "disabled");
    const oldLease = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "old-worker",
    });
    if (oldLease === null)
      throw new Error("expected old lease");

    redisNow = 200;
    const currentLease = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "current-worker",
    });
    if (currentLease === null)
      throw new Error("expected current lease");

    await expect(store.rescheduleRepairSubject({
      lease: oldLease,
      retryDelayMs: 50,
    })).resolves.toBe("stale_lease");
    await expect(store.finalizeRepairSubject({
      lease: oldLease,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier: subjects[0],
        state: "disabled",
        transitionId: transitions[0],
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
    })).resolves.toBe("stale_lease");
    await expect(store.rescheduleRepairSubject({
      lease: currentLease,
      retryDelayMs: 50,
    })).resolves.toBe("rescheduled");
  });

  test("rejects stable targets whose committed transition ID does not match the owner", async () => {
    const store = createInMemorySubjectAccessStore(
      [enabledRecord(subjects[0]!), enabledRecord(subjects[1]!)],
      { clock: { now: () => 100 } },
    );
    await begin(store, subjects[0]!, transitions[0]!);
    await prepare(store, subjects[0]!, transitions[0]!);
    await expect(store.finalize({
      subjectIdentifier: subjects[0]!,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier: subjects[0],
        state: "enabled",
        transitionId: transitions[1],
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
      targetState: "enabled",
      transitionId: transitions[0]!,
    })).resolves.toBe("invalid");

    await begin(store, subjects[1]!, transitions[1]!);
    await prepare(store, subjects[1]!, transitions[1]!);
    const lease = await store.claimRepairSubject({
      leaseDurationMs: 100,
      leaseToken: "repair-owner",
      subjectIdentifier: subjects[1],
    });
    if (lease === null)
      throw new Error("expected repair lease");
    await expect(store.finalizeRepairSubject({
      lease,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier: subjects[1],
        state: "enabled",
        transitionId: transitions[2],
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
    })).resolves.toBe("invalid");
  });
});
