import type {
  SubjectAccessBeginReceipt,
  SubjectAccessTransition,
} from "./model";
import type {
  SubjectAccessAtomicStore,
  SubjectAccessRepairLease,
} from "./storage/store";
import {
  SubjectAccessBeginPendingError,
  SubjectAccessDisabledError,
  SubjectAccessTransitionRejectedError,
  SubjectAccessUnavailableError,
  SubjectAccessWriteUnavailableError,
} from "./errors";
import {
  parseSubjectAccessRecord,
  serializeSubjectAccessRecord,
} from "./model";

export interface CreateSubjectAccessBarrierOptions {
  readonly store: SubjectAccessAtomicStore;
  readonly clock: {
    nowDate: () => Date;
  };
  readonly random: {
    uuid: () => string;
  };
}

export function createSubjectAccessBarrier(options: CreateSubjectAccessBarrierOptions) {
  async function readSnapshot(subjectIdentifier: string) {
    let serialized;
    try {
      serialized = await options.store.read(subjectIdentifier);
    }
    catch (cause) {
      throw new SubjectAccessUnavailableError(cause);
    }
    if (serialized === null)
      throw new SubjectAccessUnavailableError();

    const parsed = parseSubjectAccessRecord(serialized);
    if (!parsed.success || parsed.data.subjectIdentifier !== subjectIdentifier)
      throw new SubjectAccessUnavailableError();
    return {
      record: parsed.data,
      committedTransitionId: parsed.data.transitionId,
    };
  }

  async function read(subjectIdentifier: string) {
    return (await readSnapshot(subjectIdentifier)).record;
  }

  async function assertAccessible(subjectIdentifier: string) {
    const { committedTransitionId, record } = await readSnapshot(subjectIdentifier);
    if (record.state === "enabled" && committedTransitionId !== undefined)
      return;
    if (record.state === "disabled")
      throw new SubjectAccessDisabledError();
    throw new SubjectAccessUnavailableError();
  }

  async function readCommittedTransitionId(subjectIdentifier: string) {
    const snapshot = await readSnapshot(subjectIdentifier);
    if (
      snapshot.record.state === "enabled"
      && snapshot.committedTransitionId !== undefined
    ) {
      return snapshot.committedTransitionId;
    }
    if (snapshot.record.state === "disabled")
      throw new SubjectAccessDisabledError();
    throw new SubjectAccessUnavailableError();
  }

  async function isCommittedTransitionCurrent(
    subjectIdentifier: string,
    committedTransitionId: string,
  ) {
    const snapshot = await readSnapshot(subjectIdentifier);
    if (snapshot.record.state === "disabled")
      throw new SubjectAccessDisabledError();
    if (
      snapshot.record.state !== "enabled"
      || snapshot.committedTransitionId === undefined
    ) {
      throw new SubjectAccessUnavailableError();
    }
    return snapshot.committedTransitionId === committedTransitionId;
  }

  async function beginBlocking(
    subjectIdentifier: string,
    input: { readonly transitionId?: string } = {},
  ): Promise<SubjectAccessTransition> {
    const transitionId = input.transitionId ?? options.random.uuid();
    const updatedAt = options.clock.nowDate();
    let result;
    try {
      result = await options.store.beginBlocking({
        subjectIdentifier,
        transitionId,
        blockingRecord: serializeSubjectAccessRecord({
          version: 1,
          subjectIdentifier,
          state: "blocking",
          transitionId,
          updatedAt: updatedAt.toISOString(),
        }),
      });
    }
    catch {
      throw new SubjectAccessBeginPendingError({
        subjectIdentifier,
        transitionId,
      });
    }
    if (result === "conflict" || result === "invalid")
      throw new SubjectAccessTransitionRejectedError();
    return {
      subjectIdentifier,
      transitionId,
      previousCommittedTransitionId: result.previousCommittedTransitionId,
    };
  }

  async function abortBegin(receipt: SubjectAccessBeginReceipt) {
    let result;
    try {
      result = await options.store.abortBegin(receipt);
    }
    catch {
      throw new SubjectAccessWriteUnavailableError();
    }
    if (
      result !== "aborted"
      && result !== "already_aborted"
      && result !== "not_started"
    ) {
      throw new SubjectAccessTransitionRejectedError();
    }
  }

  async function finalize(
    transition: SubjectAccessTransition,
    targetState: "enabled" | "disabled",
  ) {
    let result;
    try {
      result = await options.store.finalize({
        ...transition,
        targetState,
        targetRecord: serializeSubjectAccessRecord({
          version: 1,
          subjectIdentifier: transition.subjectIdentifier,
          state: targetState,
          transitionId: transition.transitionId,
          updatedAt: options.clock.nowDate().toISOString(),
        }),
      });
    }
    catch {
      throw new SubjectAccessWriteUnavailableError();
    }
    if (result !== "finalized" && result !== "already_finalized")
      throw new SubjectAccessTransitionRejectedError();
  }

  async function prepareRepair(
    transition: SubjectAccessTransition,
    targetState: "enabled" | "disabled",
  ) {
    let result;
    try {
      result = await options.store.prepareRepair({
        ...transition,
        targetState,
      });
    }
    catch {
      throw new SubjectAccessWriteUnavailableError();
    }
    if (result !== "prepared" && result !== "already_prepared")
      throw new SubjectAccessTransitionRejectedError();
  }

  async function rollback(transition: SubjectAccessTransition) {
    let result;
    try {
      result = await options.store.rollback(transition);
    }
    catch {
      throw new SubjectAccessWriteUnavailableError();
    }
    if (result !== "rolled_back" && result !== "already_rolled_back")
      throw new SubjectAccessTransitionRejectedError();
  }

  async function finalizeRepair(
    lease: SubjectAccessRepairLease,
  ): Promise<"finalized" | "stale"> {
    let result;
    try {
      result = await options.store.finalizeRepairSubject({
        lease,
        targetRecord: serializeSubjectAccessRecord({
          version: 1,
          subjectIdentifier: lease.subjectIdentifier,
          state: lease.targetState,
          transitionId: lease.transitionId,
          updatedAt: options.clock.nowDate().toISOString(),
        }),
      });
    }
    catch {
      throw new SubjectAccessWriteUnavailableError();
    }
    if (result === "finalized")
      return "finalized";
    if (result === "stale_lease" || result === "lease_expired")
      return "stale";
    throw new SubjectAccessTransitionRejectedError();
  }

  return {
    abortBegin,
    assertAccessible,
    beginBlocking,
    finalize,
    finalizeRepair,
    isCommittedTransitionCurrent,
    prepareRepair,
    read,
    readCommittedTransitionId,
    rollback,
  };
}

export type SubjectAccessBarrier = ReturnType<typeof createSubjectAccessBarrier>;
