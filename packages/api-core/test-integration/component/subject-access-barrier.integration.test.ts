import type { SubjectAccessAtomicStore } from "../../src/subject-access/storage/store";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectAccessBarrier,
  SubjectAccessBeginPendingError,
  SubjectAccessDisabledError,
  SubjectAccessTransitionRejectedError,
  SubjectAccessUnavailableError,
  SubjectAccessWriteUnavailableError,
} from "../../src/subject-access";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

function record(state: "enabled" | "blocking" | "disabled") {
  return JSON.stringify({
    version: 1,
    subjectIdentifier,
    state,
    transitionId: state === "blocking"
      ? "10000000-0000-4000-8000-000000000001"
      : "20000000-0000-4000-8000-000000000001",
    updatedAt: "2026-07-31T08:00:00.000Z",
  });
}

function createStore(serialized: string | null): SubjectAccessAtomicStore {
  return {
    abortBegin: mock(async () => "aborted" as const),
    beginBlocking: mock(async () => ({
      status: "transitioned" as const,
      previousCommittedTransitionId: "20000000-0000-4000-8000-000000000001",
    })),
    claimRepairSubject: mock(async () => null),
    claimTransitionRecovery: mock(async () => null),
    finalize: mock(async () => "finalized" as const),
    finalizeRepairSubject: mock(async () => "finalized" as const),
    inspectRepairBacklog: mock(async () => ({ count: 0, oldestAgeMs: null })),
    prepareRepair: mock(async () => "prepared" as const),
    read: mock(async () => serialized),
    reconcileTransitionRecovery: mock(async () => "prepared" as const),
    rescheduleRepairSubject: mock(async () => "rescheduled" as const),
    rescheduleTransitionRecovery: mock(async () => "rescheduled" as const),
    rollback: mock(async () => "rolled_back" as const),
  };
}

describe("Subject Access Barrier", () => {
  test("only enabled continues while disabled and every uncertain read fail closed", async () => {
    const enabled = createSubjectAccessBarrier({
      store: createStore(record("enabled")),
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });
    await expect(enabled.assertAccessible(subjectIdentifier)).resolves.toBeUndefined();

    const disabled = createSubjectAccessBarrier({
      store: createStore(record("disabled")),
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });
    await expect(disabled.assertAccessible(subjectIdentifier))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);

    for (const serialized of [
      record("blocking"),
      null,
      "{",
      JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "unknown",
        updatedAt: "2026-07-31T08:00:00.000Z",
      }),
    ]) {
      const unavailable = createSubjectAccessBarrier({
        store: createStore(serialized),
        clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
        random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
      });
      await expect(unavailable.assertAccessible(subjectIdentifier))
        .rejects
        .toBeInstanceOf(SubjectAccessUnavailableError);
    }

    const readFailure = createStore(record("enabled"));
    readFailure.read = mock(async () => {
      throw new Error("redis unavailable");
    });
    const unavailable = createSubjectAccessBarrier({
      store: readFailure,
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });
    await expect(unavailable.assertAccessible(subjectIdentifier))
      .rejects
      .toBeInstanceOf(SubjectAccessUnavailableError);
  });

  test("fails closed for a stable record without a committed transition ID", async () => {
    const barrier = createSubjectAccessBarrier({
      store: createStore(JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "enabled",
        updatedAt: "2026-07-31T08:00:00.000Z",
      })),
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });

    await expect(barrier.assertAccessible(subjectIdentifier))
      .rejects
      .toBeInstanceOf(SubjectAccessUnavailableError);
    await expect(barrier.readCommittedTransitionId(subjectIdentifier))
      .rejects
      .toBeInstanceOf(SubjectAccessUnavailableError);
  });

  test("sanitizes write failures while preserving domain transition rejection", async () => {
    const secret = "redis://admin:secret@internal-host";
    const transition = {
      subjectIdentifier,
      transitionId: "10000000-0000-4000-8000-000000000001",
      previousCommittedTransitionId: "20000000-0000-4000-8000-000000000001",
    };

    for (const operation of ["beginBlocking", "finalize", "rollback"] as const) {
      const store = createStore(record("enabled"));
      store[operation] = mock(async () => {
        throw new Error(secret);
      }) as never;
      const barrier = createSubjectAccessBarrier({
        store,
        clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
        random: { uuid: () => transition.transitionId },
      });
      const result = operation === "beginBlocking"
        ? barrier.beginBlocking(subjectIdentifier)
        : operation === "finalize"
          ? barrier.finalize(transition, "disabled")
          : barrier.rollback(transition);

      const error = await result.catch(caught => caught);
      expect(error).toBeInstanceOf(SubjectAccessWriteUnavailableError);
      expect(error.cause).toBeUndefined();
      expect(error.message).toBe("Subject access write is unavailable");
      expect(JSON.stringify(error)).not.toContain(secret);
    }

    const rejectedStore = createStore(record("enabled"));
    rejectedStore.beginBlocking = mock(async () => "conflict" as const);
    const rejectedBarrier = createSubjectAccessBarrier({
      store: rejectedStore,
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => transition.transitionId },
    });
    await expect(rejectedBarrier.beginBlocking(subjectIdentifier))
      .rejects
      .toBeInstanceOf(SubjectAccessTransitionRejectedError);
  });

  test("returns a recoverable receipt when begin may have committed before its response was lost", async () => {
    const store = createStore(record("enabled"));
    store.beginBlocking = mock(async () => {
      throw new Error("redis response lost");
    });
    const barrier = createSubjectAccessBarrier({
      store,
      clock: { nowDate: () => new Date("2026-07-31T08:00:00.000Z") },
      random: { uuid: () => "10000000-0000-4000-8000-000000000001" },
    });

    const pending = await barrier.beginBlocking(subjectIdentifier)
      .catch(error => error);

    expect(pending).toBeInstanceOf(SubjectAccessBeginPendingError);
    expect(pending).toBeInstanceOf(SubjectAccessWriteUnavailableError);
    expect(pending.receipt).toEqual({
      subjectIdentifier,
      transitionId: "10000000-0000-4000-8000-000000000001",
    });

    await barrier.abortBegin(pending.receipt);
    expect(store.abortBegin).toHaveBeenCalledWith(pending.receipt);
  });
});
