import type {
  RedisTestHarness,
  SubjectAccessRedisTestScope,
} from "./redis-test-harness";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  createSubjectAccessRepair,
  SubjectAccessDisabledError,
  SubjectAccessTransitionRejectedError,
} from "../../src/subject-access";
import { createRedisTestHarness } from "./redis-test-harness";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const secondSubjectIdentifier = "00000000-0000-4000-8000-000000000002";
const thirdSubjectIdentifier = "00000000-0000-4000-8000-000000000003";
const writerTransitionIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
const observerTransitionIds = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "20000000-0000-4000-8000-000000000006",
];

let harness: RedisTestHarness | undefined;
let scope: SubjectAccessRedisTestScope | undefined;

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("expected the Redis operation to reject");
}

beforeAll(async () => {
  harness = await createRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createSubjectAccessScope({
    writerTransitionIds,
    observerTransitionIds,
  });
  const initial = await scope.writer.beginBlocking(subjectIdentifier);
  await scope.writer.prepareRepair(initial, "enabled");
  await scope.writer.finalize(initial, "enabled");
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Subject Access real Redis contract", () => {
  test("production repair recovers a pre-age-index backlog after an in-place upgrade", async () => {
    const transition = await scope!.writer.beginBlocking(secondSubjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    await scope!.removeRepairAgeEntry(secondSubjectIdentifier);
    const warnings: Array<{ fields: Record<string, unknown>; message: string }> = [];
    const repair = createSubjectAccessRepair({
      authority: {
        async resolve() {
          return { accountState: "enabled", factsState: "current" };
        },
      },
      backlog: scope!.writerBacklog,
      barrier: scope!.writer,
      logger: {
        warn(fields, message) {
          warnings.push({ fields, message });
        },
      },
      random: { uuid: () => "upgrade-repair-owner" },
    });

    expect(await repair.repairPending({ limit: 1 })).toEqual({
      disabled: 0,
      enabled: 1,
      deferred: 0,
      failed: 0,
      stable: 0,
    });
    expect(await scope!.observer.assertAccessible(secondSubjectIdentifier))
      .toBeUndefined();
    expect(await scope!.observerBacklog.inspectRepairBacklog()).toEqual({
      count: 0,
      oldestAgeMs: null,
    });
    expect(warnings).toEqual([]);

    const deferredTransition = await scope!.writer.beginBlocking(thirdSubjectIdentifier);
    await scope!.writer.prepareRepair(deferredTransition, "enabled");
    await Bun.sleep(25);
    await scope!.removeRepairAgeEntry(thirdSubjectIdentifier);
    const deferredRepair = createSubjectAccessRepair({
      authority: {
        async resolve() {
          return { accountState: "enabled", factsState: "not_current" };
        },
      },
      backlog: scope!.writerBacklog,
      barrier: scope!.writer,
      logger: { warn() {} },
      random: { uuid: () => "upgrade-deferred-owner" },
    });

    expect(await deferredRepair.repairSubject(thirdSubjectIdentifier)).toEqual({
      status: "deferred",
    });
    const migratedMetrics = await scope!.observerBacklog.inspectRepairBacklog();
    expect(migratedMetrics.count).toBe(1);
    expect(migratedMetrics.oldestAgeMs).toBeGreaterThanOrEqual(15);
    await scope!.writer.finalize(deferredTransition, "enabled");
  });

  test("reports a durable redacted repair backlog count and oldest age", async () => {
    await expect(scope!.observerBacklog.inspectRepairBacklog()).resolves.toEqual({
      count: 0,
      oldestAgeMs: null,
    });

    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    await Bun.sleep(25);
    const beforeClaim = await scope!.observerBacklog.inspectRepairBacklog();
    expect(beforeClaim.count).toBe(1);
    expect(beforeClaim.oldestAgeMs).toBeGreaterThanOrEqual(15);
    expect(Object.keys(beforeClaim).sort()).toEqual(["count", "oldestAgeMs"]);

    const lease = await scope!.writerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "metrics-owner",
    });
    if (lease === null)
      throw new Error("expected repair lease");
    await scope!.writerBacklog.rescheduleRepairSubject({
      lease,
      retryDelayMs: 60_000,
    });
    const afterBackoff = await scope!.observerBacklog.inspectRepairBacklog();
    expect(afterBackoff.count).toBe(1);
    expect(afterBackoff.oldestAgeMs).toBeGreaterThanOrEqual(
      beforeClaim.oldestAgeMs ?? 0,
    );

    await scope!.writer.finalize(transition, "enabled");
    const afterConvergence = await scope!.observerBacklog.inspectRepairBacklog();
    expect(afterConvergence).toEqual({
      count: 0,
      oldestAgeMs: null,
    });
    process.stdout.write(`${JSON.stringify({
      event: "subject_access.repair_backlog.rehearsal",
      beforeClaim,
      afterBackoff,
      afterConvergence,
    })}\n`);
  });

  test("fails closed when repair backlog metric indexes diverge", async () => {
    await scope!.seedRepairIndex([secondSubjectIdentifier]);
    await scope!.seedRepairAgeIndex([thirdSubjectIdentifier]);

    const error = await captureRejection(
      scope!.observerBacklog.inspectRepairBacklog(),
    );
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe(
      "Redis Subject Access repair backlog indexes are inconsistent",
    );
    expect((error as Error).message).not.toContain(secondSubjectIdentifier);
  });

  test("bootstrap seeds every missing subject without overwriting a newer stable state", async () => {
    const seeded = await scope!.bootstrap.seedMany([{
      subjectIdentifier,
      state: "disabled",
    }, {
      subjectIdentifier: secondSubjectIdentifier,
      state: "disabled",
    }], new Date("2026-08-01T06:00:00.000Z"));
    expect(seeded).toEqual({
      seeded: 1,
      retainedExisting: 1,
    });

    const inspected = await scope!.bootstrap.inspectMany([
      subjectIdentifier,
      secondSubjectIdentifier,
    ]);
    expect(inspected[0]).toMatchObject({
      status: "valid",
      record: { subjectIdentifier, state: "enabled", version: 1 },
    });
    expect(inspected[1]).toMatchObject({
      status: "valid",
      record: {
        subjectIdentifier: secondSubjectIdentifier,
        state: "disabled",
        version: 1,
      },
    });
  });

  test("keeps a mutating transition indexed but unclaimable until commit confirmation", async () => {
    const attempts = await Promise.allSettled([
      scope!.writer.beginBlocking(subjectIdentifier),
      scope!.observer.beginBlocking(subjectIdentifier),
    ]);
    const winner = attempts.find(result => result.status === "fulfilled");
    const loser = attempts.find(result => result.status === "rejected");
    expect(winner?.status).toBe("fulfilled");
    expect(loser?.status).toBe("rejected");
    expect((loser as PromiseRejectedResult).reason)
      .toBeInstanceOf(SubjectAccessTransitionRejectedError);
    expect(await scope!.writerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "before-commit",
    })).toBeNull();

    const winningTransition = (winner as PromiseFulfilledResult<{
      previousCommittedTransitionId: string | null;
      subjectIdentifier: string;
      transitionId: string;
    }>).value;
    await scope!.writer.prepareRepair(winningTransition, "enabled");
    const repairLease = await scope!.observerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "after-commit",
    });
    expect(repairLease).toMatchObject({
      subjectIdentifier,
      targetState: "enabled",
      transitionId: winningTransition.transitionId,
    });
  });

  test("same-transition prepare and finalize are idempotent and remove repair work", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await Promise.all([
      scope!.writer.prepareRepair(transition, "disabled"),
      scope!.observer.prepareRepair(transition, "disabled"),
    ]);
    await Promise.all([
      scope!.writer.finalize(transition, "disabled"),
      scope!.observer.finalize(transition, "disabled"),
    ]);

    const disabledError = await captureRejection(
      scope!.observer.assertAccessible(subjectIdentifier),
    );
    expect(disabledError).toBeInstanceOf(SubjectAccessDisabledError);
    expect(await scope!.observerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "after-finalize",
    })).toBeNull();
  });

  test("treats same-target prepare as confirmed after repair already finalized it", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    await scope!.writer.finalize(transition, "enabled");

    const result = await scope!.observer.prepareRepair(transition, "enabled");
    expect(result).toBeUndefined();
  });

  test("confirmed rollback is idempotent and cannot race a repairable target", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    const rollbackResults = await Promise.all([
      scope!.writer.rollback(transition),
      scope!.observer.rollback(transition),
      scope!.writer.rollback(transition),
    ]);
    expect(rollbackResults).toEqual([undefined, undefined, undefined]);
    const accessible = await scope!.observer.assertAccessible(subjectIdentifier);
    expect(accessible).toBeUndefined();

    const committed = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(committed, "disabled");
    const rollbackError = await captureRejection(
      scope!.observer.rollback(committed),
    );
    expect(rollbackError).toBeInstanceOf(SubjectAccessTransitionRejectedError);
  });

  test("idempotently aborts the exact uncertain begin and treats a missing begin as a no-op", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    const receipt = {
      subjectIdentifier: transition.subjectIdentifier,
      transitionId: transition.transitionId,
    };

    await scope!.writer.abortBegin(receipt);
    await scope!.observer.abortBegin(receipt);
    await scope!.writer.abortBegin({
      subjectIdentifier: secondSubjectIdentifier,
      transitionId: "30000000-0000-4000-8000-000000000001",
    });

    const accessible = await scope!.observer.assertAccessible(subjectIdentifier);
    expect(accessible).toBeUndefined();
  });

  test("does not let more than one stale cleanup page hide valid repair work", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    const staleSubjects = Array.from({ length: 65 }, (_, index) =>
      `00000000-0000-4000-8001-${String(index).padStart(12, "0")}`);
    await scope!.seedRepairIndex(staleSubjects);

    const repairLease = await scope!.writerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "after-stale-prefix",
    });
    expect(repairLease).toMatchObject({
      subjectIdentifier,
      transitionId: transition.transitionId,
    });
  });

  test("lets a targeted publication nudge bypass backoff without stealing a live lease", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    const activeLease = await scope!.writerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "active-owner",
      subjectIdentifier,
    });
    if (activeLease === null)
      throw new Error("expected active repair lease");

    const prematureClaim = await scope!.observerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "publisher-too-early",
      subjectIdentifier,
    });
    expect(prematureClaim).toBeNull();
    await scope!.writerBacklog.rescheduleRepairSubject({
      lease: activeLease,
      retryDelayMs: 60_000,
    });
    const publicationClaim = await scope!.observerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "publisher-current-facts",
      subjectIdentifier,
    });
    expect(publicationClaim).toMatchObject({
      leaseToken: "publisher-current-facts",
      subjectIdentifier,
    });
  });

  test("rejects stable wire records with unknown fields instead of overwriting them", async () => {
    await scope!.seedRecord(secondSubjectIdentifier, JSON.stringify({
      version: 1,
      subjectIdentifier: secondSubjectIdentifier,
      state: "enabled",
      updatedAt: "2026-07-31T08:00:00.000Z",
      unknownField: "must fail closed",
    }));

    const error = await captureRejection(
      scope!.writer.beginBlocking(secondSubjectIdentifier),
    );
    expect(error).toBeInstanceOf(SubjectAccessTransitionRejectedError);
  });

  test("committed target cannot be reversed by a contrary repair", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    const error = await captureRejection(
      scope!.observer.finalize(transition, "disabled"),
    );
    expect(error).toBeInstanceOf(SubjectAccessTransitionRejectedError);
    await scope!.writer.finalize(transition, "enabled");
  });

  test("raw finalizers reject a stable record owned by another transition", async () => {
    const transition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(transition, "enabled");
    const finalization = await scope!.writerBacklog.finalize({
      subjectIdentifier,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "enabled",
        transitionId: observerTransitionIds[0],
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
      targetState: "enabled",
      transitionId: transition.transitionId,
    });
    expect(finalization).toBe("invalid");

    const lease = await scope!.writerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "mismatched-target",
      subjectIdentifier,
    });
    if (lease === null)
      throw new Error("expected repair lease");
    const repairFinalization = await scope!.writerBacklog.finalizeRepairSubject({
      lease,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "enabled",
        transitionId: observerTransitionIds[0],
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
    });
    expect(repairFinalization).toBe("invalid");
  });

  test("Redis TIME leases are disjoint and reject every late old-owner mutation", async () => {
    const firstTransition = await scope!.writer.beginBlocking(subjectIdentifier);
    await scope!.writer.prepareRepair(firstTransition, "disabled");

    const secondInitial = await scope!.writer.beginBlocking(secondSubjectIdentifier);
    await scope!.writer.prepareRepair(secondInitial, "enabled");
    await scope!.writer.finalize(secondInitial, "enabled");
    const secondTransition = await scope!.writer.beginBlocking(secondSubjectIdentifier);
    await scope!.writer.prepareRepair(secondTransition, "enabled");

    const [firstClaim, secondClaim] = await Promise.all([
      scope!.writerBacklog.claimRepairSubject({
        leaseDurationMs: 80,
        leaseToken: "writer-clock-ahead",
      }),
      scope!.observerBacklog.claimRepairSubject({
        leaseDurationMs: 80,
        leaseToken: "observer-clock-behind",
      }),
    ]);
    expect(new Set([
      firstClaim?.subjectIdentifier,
      secondClaim?.subjectIdentifier,
    ])).toEqual(new Set([subjectIdentifier, secondSubjectIdentifier]));

    const oldLease = firstClaim?.subjectIdentifier === subjectIdentifier
      ? firstClaim
      : secondClaim;
    if (oldLease === null || oldLease === undefined)
      throw new Error("expected old lease");
    await Bun.sleep(100);
    const currentLease = await scope!.observerBacklog.claimRepairSubject({
      leaseDurationMs: 1_000,
      leaseToken: "current-owner",
      subjectIdentifier,
    });
    if (currentLease === null)
      throw new Error("expected current lease");

    const oldReschedule = await scope!.writerBacklog.rescheduleRepairSubject({
      lease: oldLease,
      retryDelayMs: 1_000,
    });
    expect(oldReschedule).toBe("stale_lease");
    const oldFinalization = await scope!.writerBacklog.finalizeRepairSubject({
      lease: oldLease,
      targetRecord: JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "disabled",
        transitionId: firstTransition.transitionId,
        updatedAt: "2026-07-31T08:06:00.000Z",
      }),
    });
    expect(oldFinalization).toBe("stale_lease");
    const currentReschedule = await scope!.observerBacklog.rescheduleRepairSubject({
      lease: currentLease,
      retryDelayMs: 1_000,
    });
    expect(currentReschedule).toBe("rescheduled");
  });
});
