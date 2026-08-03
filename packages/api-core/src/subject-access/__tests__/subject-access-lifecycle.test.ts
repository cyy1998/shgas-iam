import { describe, expect, mock, test } from "bun:test";
import { markTransactionRollbackConfirmed } from "../../uow";
import {
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessRepair,
  SubjectAccessBeginPendingError,
  SubjectAccessCommitPendingError,
  SubjectAccessRecordV1Schema,
  SubjectAccessRollbackPendingError,
} from "../index";
import {
  createInMemorySubjectAccessStore,
} from "../testing";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const transitionId = "10000000-0000-4000-8000-000000000001";
const ownerToken = "30000000-0000-4000-8000-000000000001";
const initialRecord = {
  version: 1 as const,
  subjectIdentifier,
  state: "enabled" as const,
  transitionId: "20000000-0000-4000-8000-000000000001",
  updatedAt: "2026-07-31T08:00:00.000Z",
};

function createHarness() {
  const store = createInMemorySubjectAccessStore(
    [initialRecord],
    { clock: { now: () => new Date("2026-07-31T08:05:00.000Z").getTime() } },
  );
  const barrier = createSubjectAccessBarrier({
    store,
    clock: { nowDate: () => new Date("2026-07-31T08:05:00.000Z") },
    random: { uuid: () => transitionId },
  });
  const warn = mock((_fields: Record<string, unknown>, _message: string) => undefined);
  const createIntent = mock(async () => undefined);
  const assertCommitted = mock(async () => undefined);
  const markRolledBack = mock(async () => undefined);
  const generatedIds = [transitionId, ownerToken];
  const lifecycle = createSubjectAccessLifecycle({
    barrier,
    logger: { warn },
    random: { uuid: () => generatedIds.shift()! },
    transitionIntent: {
      create: createIntent,
      assertCommitted,
      markRolledBack,
    },
  });
  return {
    barrier,
    assertCommitted,
    createIntent,
    lifecycle,
    markRolledBack,
    store,
    warn,
  };
}

async function readRecord(store: ReturnType<typeof createInMemorySubjectAccessStore>) {
  const serialized = await store.read(subjectIdentifier);
  return serialized === null
    ? null
    : SubjectAccessRecordV1Schema.parse(JSON.parse(serialized));
}

async function repairBacklog(store: ReturnType<typeof createInMemorySubjectAccessStore>) {
  const lease = await store.claimRepairSubject({
    leaseDurationMs: 60_000,
    leaseToken: "lifecycle-test-worker",
  });
  return lease === null ? [] : [lease.subjectIdentifier];
}

describe("Subject Access account lifecycle", () => {
  test("persists only recovery intent metadata before pre-block and domain mutation", async () => {
    const { barrier, createIntent, lifecycle } = createHarness();
    const events: string[] = [];
    createIntent.mockImplementationOnce(async () => {
      events.push("postgres:intent");
    });
    const beginBlocking = barrier.beginBlocking;
    barrier.beginBlocking = mock(async (currentSubject, input) => {
      events.push("redis:pre-block");
      return await beginBlocking(currentSubject, input);
    });

    await lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async (receipt) => {
        events.push("postgres:domain-mutation");
        expect(receipt).toMatchObject({
          ownerToken,
          subjectIdentifier,
          transitionId,
        });
      },
    });

    expect(events).toEqual([
      "postgres:intent",
      "redis:pre-block",
      "postgres:domain-mutation",
    ]);
    expect(createIntent).toHaveBeenCalledWith({
      ownerToken,
      subjectIdentifier,
      transitionId,
    });
    expect(barrier.beginBlocking).toHaveBeenCalledWith(
      subjectIdentifier,
      { transitionId },
    );
  });

  test("never pre-blocks or mutates when durable intent creation fails", async () => {
    const { barrier, createIntent, lifecycle } = createHarness();
    const intentError = new Error("intent unavailable");
    createIntent.mockRejectedValueOnce(intentError);
    barrier.beginBlocking = mock(barrier.beginBlocking);
    const mutate = mock(async () => undefined);

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate,
    })).rejects.toBe(intentError);

    expect(barrier.beginBlocking).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  test("does not expose a mutating transition to authority repair before commit", async () => {
    const { lifecycle, store } = createHarness();
    let finishMutation!: () => void;
    const mutationCanFinish = new Promise<void>((resolve) => {
      finishMutation = resolve;
    });
    let mutationStarted!: () => void;
    const mutationDidStart = new Promise<void>((resolve) => {
      mutationStarted = resolve;
    });

    const running = lifecycle.run({
      subjectIdentifier,
      disposition: "awaiting_publication",
      mutate: async () => {
        mutationStarted();
        await mutationCanFinish;
      },
    });
    await mutationDidStart;

    expect((await readRecord(store))?.state).toBe("blocking");
    expect(await repairBacklog(store)).toEqual([]);

    finishMutation();
    await running;

    expect(await repairBacklog(store)).toEqual([subjectIdentifier]);
  });

  test("best-effort aborts an uncertain begin before any database mutation can start", async () => {
    const { barrier, lifecycle } = createHarness();
    const receipt = { subjectIdentifier, transitionId };
    const pending = new SubjectAccessBeginPendingError(receipt);
    barrier.beginBlocking = mock(async () => {
      throw pending;
    });
    barrier.abortBegin = mock(async () => undefined);
    const mutate = mock(async () => "must not run");

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate,
    })).rejects.toBe(pending);

    expect(barrier.abortBegin).toHaveBeenCalledWith(receipt);
    expect(mutate).not.toHaveBeenCalled();
  });

  test("idempotently aborts a begin whose response outcome was unknown", async () => {
    const { barrier, lifecycle, store } = createHarness();
    const transition = await barrier.beginBlocking(subjectIdentifier);
    const receipt = {
      subjectIdentifier: transition.subjectIdentifier,
      transitionId: transition.transitionId,
    };

    await lifecycle.confirmBeginAborted(receipt);
    await lifecycle.confirmBeginAborted(receipt);

    expect(await readRecord(store)).toEqual(initialRecord);
    expect(await repairBacklog(store)).toEqual([]);
  });

  test("restores the previous state when the database mutation rolls back", async () => {
    const { lifecycle, store } = createHarness();
    const mutationError = new Error("database rollback");
    markTransactionRollbackConfirmed(mutationError);
    const revokeSessions = mock(async () => undefined);

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => {
        expect((await readRecord(store))?.state).toBe("blocking");
        throw mutationError;
      },
      revokeSessions,
    })).rejects.toBe(mutationError);

    expect(await readRecord(store)).toEqual(initialRecord);
    expect(await repairBacklog(store)).toEqual([]);
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  test("restores the Barrier when a reaped pre-begin owner resumes too late", async () => {
    const {
      barrier,
      createIntent,
      lifecycle,
      markRolledBack,
      store,
    } = createHarness();
    let intentReaped = false;
    createIntent.mockImplementationOnce(async () => {
      intentReaped = true;
    });
    const beginBlocking = barrier.beginBlocking;
    barrier.beginBlocking = mock(async (currentSubject, input) => {
      expect(intentReaped).toBe(true);
      return await beginBlocking(currentSubject, input);
    });
    const domainMutation = mock(async () => "must not run");
    const ownershipError = new Error("transition owner is no longer pending");
    markTransactionRollbackConfirmed(ownershipError);

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => {
        expect((await readRecord(store))?.state).toBe("blocking");
        if (!intentReaped)
          return await domainMutation();
        throw ownershipError;
      },
    })).rejects.toBe(ownershipError);

    expect(barrier.beginBlocking).toHaveBeenCalledWith(
      subjectIdentifier,
      { transitionId },
    );
    expect(domainMutation).not.toHaveBeenCalled();
    expect(markRolledBack).toHaveBeenCalledWith({
      ownerToken,
      subjectIdentifier,
      transitionId,
    });
    expect(await readRecord(store)).toEqual(initialRecord);
    expect(await repairBacklog(store)).toEqual([]);
  });

  test("keeps an unknown database outcome fail closed and unrepairable", async () => {
    const { lifecycle, store, warn } = createHarness();
    const unknownOutcome = new Error("connection lost while committing");

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => {
        throw unknownOutcome;
      },
    })).rejects.toBe(unknownOutcome);

    expect((await readRecord(store))?.state).toBe("blocking");
    expect(await repairBacklog(store)).toEqual([]);
    expect(warn).toHaveBeenCalledWith({
      errorType: "Error",
      operation: "mutation_outcome_unknown",
      requestId: undefined,
      subjectIdentifier,
      traceId: undefined,
      transitionId,
    }, "Subject Access post-commit action failed");
  });

  test("exposes the same transition receipt when confirmed rollback restoration fails", async () => {
    const { barrier, lifecycle, store } = createHarness();
    const mutationError = new Error("database rollback");
    markTransactionRollbackConfirmed(mutationError);
    const rollback = barrier.rollback;
    barrier.rollback = mock(async () => {
      throw new Error("redis unavailable");
    });

    const pending = await lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => {
        throw mutationError;
      },
    }).catch(error => error);
    expect(pending).toBeInstanceOf(SubjectAccessRollbackPendingError);
    expect(pending.receipt).toEqual({
      subjectIdentifier,
      transitionId,
      previousCommittedTransitionId: initialRecord.transitionId,
    });
    expect((await readRecord(store))?.state).toBe("blocking");

    barrier.rollback = rollback;
    await lifecycle.confirmRollback(pending.receipt);
    expect(await readRecord(store)).toEqual(initialRecord);
  });

  test("finalizes committed disable before revoking sessions", async () => {
    const { lifecycle, store } = createHarness();
    const events: string[] = [];

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => {
        events.push("database:committed");
        return "committed";
      },
      revokeSessions: async () => {
        expect((await readRecord(store))?.state).toBe("disabled");
        events.push("sessions:revoked");
      },
    })).resolves.toBe("committed");

    expect((await readRecord(store))?.state).toBe("disabled");
    expect(await repairBacklog(store)).toEqual([]);
    expect(events).toEqual(["database:committed", "sessions:revoked"]);
  });

  test("skips eager cleanup when there was no previous session generation to target", async () => {
    const store = createInMemorySubjectAccessStore(
      [],
      { clock: { now: () => new Date("2026-07-31T08:05:00.000Z").getTime() } },
    );
    const barrier = createSubjectAccessBarrier({
      store,
      clock: { nowDate: () => new Date("2026-07-31T08:05:00.000Z") },
      random: { uuid: () => transitionId },
    });
    const lifecycle = createSubjectAccessLifecycle({
      barrier,
      logger: { warn: () => undefined },
      random: {
        uuid: (() => {
          const values = [transitionId, ownerToken];
          return () => values.shift()!;
        })(),
      },
      transitionIntent: {
        create: async () => undefined,
        assertCommitted: async () => undefined,
        markRolledBack: async () => undefined,
      },
    });
    const revokeSessions = mock(async () => undefined);

    await lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => "committed",
      revokeSessions,
    });

    expect(revokeSessions).not.toHaveBeenCalled();
  });

  test("keeps blocking indexed when finalize fails after commit", async () => {
    const { barrier, lifecycle, store, warn } = createHarness();
    const finalizeFailure = new Error("redis finalize unavailable");
    const finalize = barrier.finalize;
    barrier.finalize = mock(async () => {
      throw finalizeFailure;
    });
    const revokeSessions = mock(async () => undefined);

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: "disabled",
      mutate: async () => "committed",
      revokeSessions,
      observability: { requestId: "req-1", traceId: "trace-1" },
    })).resolves.toBe("committed");

    expect((await readRecord(store))?.state).toBe("blocking");
    expect(await repairBacklog(store)).toEqual([subjectIdentifier]);
    expect(revokeSessions).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      errorCode: undefined,
      errorType: "Error",
      operation: "finalize",
      requestId: "req-1",
      subjectIdentifier,
      traceId: "trace-1",
      transitionId,
    }, "Subject Access post-commit action failed");
    barrier.finalize = finalize;
  });

  test("exposes a committed receipt when repair preparation fails", async () => {
    const { barrier, lifecycle, store } = createHarness();
    const prepareRepair = barrier.prepareRepair;
    barrier.prepareRepair = mock(async () => {
      throw new Error("redis unavailable");
    });

    const pending = await lifecycle.run({
      subjectIdentifier,
      disposition: "awaiting_publication",
      mutate: async () => "committed",
    }).catch(error => error);
    expect(pending).toBeInstanceOf(SubjectAccessCommitPendingError);
    expect(pending.receipt).toEqual({
      subjectIdentifier,
      transitionId,
      previousCommittedTransitionId: initialRecord.transitionId,
    });
    expect(pending.targetState).toBe("enabled");
    expect(await repairBacklog(store)).toEqual([]);

    barrier.prepareRepair = prepareRepair;
    await lifecycle.confirmCommit(pending.receipt, pending.targetState);
    expect(await repairBacklog(store)).toEqual([subjectIdentifier]);
  });

  test("confirms a lost prepare response after the same target already repaired", async () => {
    const { barrier, lifecycle, store } = createHarness();
    const prepareRepair = barrier.prepareRepair;
    barrier.prepareRepair = mock(async (transition, targetState) => {
      await prepareRepair(transition, targetState);
      throw new Error("prepare response lost");
    });

    const pending = await lifecycle.run({
      subjectIdentifier,
      disposition: "awaiting_publication",
      mutate: async () => "committed",
    }).catch(error => error);
    expect(pending).toBeInstanceOf(SubjectAccessCommitPendingError);

    const repair = createSubjectAccessRepair({
      authority: {
        resolve: async () => ({
          accountState: "enabled",
          factsState: "current",
        }),
      },
      backlog: store,
      barrier,
      logger: { warn: () => undefined },
      random: { uuid: () => "30000000-0000-4000-8000-000000000001" },
    });
    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "enabled",
    });

    barrier.prepareRepair = prepareRepair;
    await expect(lifecycle.confirmCommit(
      pending.receipt,
      pending.targetState,
    )).resolves.toBeUndefined();
  });

  test("keeps re-enabled accounts blocking until publication repair", async () => {
    const { lifecycle, store } = createHarness();
    const revokeSessions = mock(async () => undefined);

    await lifecycle.run({
      subjectIdentifier,
      disposition: "awaiting_publication",
      mutate: async () => undefined,
      revokeSessions,
    });

    expect((await readRecord(store))?.state).toBe("blocking");
    expect(await repairBacklog(store)).toEqual([subjectIdentifier]);
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  test("lets committed transaction results restore the previous stable state", async () => {
    const { lifecycle, store } = createHarness();
    const revokeSessions = mock(async () => undefined);

    await expect(lifecycle.run({
      subjectIdentifier,
      disposition: result => result.changed ? "disabled" : "restore_previous",
      mutate: async () => ({ changed: false, value: "unchanged" }),
      revokeSessions,
    })).resolves.toEqual({ changed: false, value: "unchanged" });

    expect(await readRecord(store)).toEqual(initialRecord);
    expect(await repairBacklog(store)).toEqual([]);
    expect(revokeSessions).not.toHaveBeenCalled();
  });
});
