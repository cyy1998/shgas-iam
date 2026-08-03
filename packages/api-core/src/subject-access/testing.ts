import type { SubjectAccessRecordV1 } from "./model";
import type {
  SubjectAccessAbortBeginResult,
  SubjectAccessAtomicStore,
  SubjectAccessBeginResult,
  SubjectAccessFinalizeResult,
  SubjectAccessPrepareRepairResult,
  SubjectAccessRepairFinalizeResult,
  SubjectAccessRepairLease,
  SubjectAccessRepairRescheduleResult,
  SubjectAccessRollbackResult,
} from "./store";
import {
  parseSubjectAccessRecord,
  serializeSubjectAccessRecord,
} from "./model";

type TransitionJournal
  = | {
    status: "mutating";
    transitionId: string;
    previousRecord: string | null;
    previousCommittedTransitionId: string | null;
    recoveryFence: number;
    recoveryLease?: {
      token: string;
      until: number;
    };
  }
  | {
    status: "repairable";
    transitionId: string;
    previousRecord: string | null;
    targetState: "enabled" | "disabled";
    fence: number;
    lease?: {
      token: string;
      until: number;
    };
  }
  | {
    status: "finalized";
    transitionId: string;
    targetState: "enabled" | "disabled";
  }
  | {
    status: "rolled_back";
    transitionId: string;
  };

export interface CreateInMemorySubjectAccessStoreOptions {
  readonly clock?: {
    readonly now: () => number;
  };
  readonly transitionRecoveryDelayMs?: number;
}

export function createInMemorySubjectAccessStore(
  initialRecords: readonly SubjectAccessRecordV1[] = [],
  options: CreateInMemorySubjectAccessStoreOptions = {},
): SubjectAccessAtomicStore {
  const records = new Map(
    initialRecords.map(record => [
      record.subjectIdentifier,
      serializeSubjectAccessRecord(record),
    ]),
  );
  const journals = new Map<string, TransitionJournal>();
  const backlog = new Map<string, number>();
  const backlogEnteredAt = new Map<string, number>();
  const transitionBacklog = new Map<string, number>();
  const now = options.clock?.now ?? Date.now;
  const transitionRecoveryDelayMs = requireNonNegativeSafeInteger(
    options.transitionRecoveryDelayMs ?? 300_000,
    "transition recovery delay",
  );

  return {
    async read(subjectIdentifier) {
      return records.get(subjectIdentifier) ?? null;
    },
    async abortBegin(input): Promise<SubjectAccessAbortBeginResult> {
      const journal = journals.get(input.subjectIdentifier);
      if (journal === undefined)
        return "not_started";
      if (journal.status === "rolled_back") {
        return journal.transitionId === input.transitionId
          ? "already_aborted"
          : "wrong_transition";
      }
      if (
        journal.status !== "mutating"
        || journal.transitionId !== input.transitionId
      ) {
        return "wrong_transition";
      }
      const current = records.get(input.subjectIdentifier);
      const parsed = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      if (
        parsed === undefined
        || !parsed.success
        || parsed.data.state !== "blocking"
        || parsed.data.transitionId !== input.transitionId
      ) {
        return "invalid";
      }

      if (journal.previousRecord === null)
        records.delete(input.subjectIdentifier);
      else
        records.set(input.subjectIdentifier, journal.previousRecord);
      journals.set(input.subjectIdentifier, {
        status: "rolled_back",
        transitionId: input.transitionId,
      });
      backlog.delete(input.subjectIdentifier);
      backlogEnteredAt.delete(input.subjectIdentifier);
      transitionBacklog.delete(input.subjectIdentifier);
      return "aborted";
    },
    async beginBlocking(input): Promise<SubjectAccessBeginResult> {
      const current = records.get(input.subjectIdentifier) ?? null;
      let previousCommittedTransitionId: string | null = null;
      if (current !== null) {
        const parsed = parseSubjectAccessRecord(current);
        if (!parsed.success || parsed.data.subjectIdentifier !== input.subjectIdentifier)
          return "invalid";
        previousCommittedTransitionId = parsed.data.transitionId ?? null;
        if (parsed.data.state === "blocking") {
          const journal = journals.get(input.subjectIdentifier);
          if (
            parsed.data.transitionId === input.transitionId
            && journal?.status === "mutating"
            && journal.transitionId === input.transitionId
          ) {
            return {
              status: "already_transitioning",
              previousCommittedTransitionId: journal.previousCommittedTransitionId,
            };
          }
          return "conflict";
        }
      }

      const blocking = parseSubjectAccessRecord(input.blockingRecord);
      if (
        !blocking.success
        || blocking.data.subjectIdentifier !== input.subjectIdentifier
        || blocking.data.state !== "blocking"
        || blocking.data.transitionId !== input.transitionId
      ) {
        return "invalid";
      }
      journals.set(input.subjectIdentifier, {
        status: "mutating",
        transitionId: input.transitionId,
        previousRecord: current,
        previousCommittedTransitionId,
        recoveryFence: 0,
      });
      records.set(input.subjectIdentifier, input.blockingRecord);
      transitionBacklog.set(
        input.subjectIdentifier,
        safeAdd(requireSafeTime(now()), transitionRecoveryDelayMs),
      );
      return {
        status: "transitioned",
        previousCommittedTransitionId,
      };
    },
    async prepareRepair(input): Promise<SubjectAccessPrepareRepairResult> {
      const journal = journals.get(input.subjectIdentifier);
      if (journal?.status === "finalized") {
        if (
          journal.transitionId === input.transitionId
          && journal.targetState === input.targetState
        ) {
          return "already_prepared";
        }
        return "wrong_transition";
      }
      if (journal?.status === "repairable") {
        if (
          journal.transitionId === input.transitionId
          && journal.targetState === input.targetState
        ) {
          return "already_prepared";
        }
        return "wrong_transition";
      }
      if (
        journal?.status !== "mutating"
        || journal.transitionId !== input.transitionId
      ) {
        return "wrong_transition";
      }
      const current = records.get(input.subjectIdentifier);
      const parsed = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      if (
        parsed === undefined
        || !parsed.success
        || parsed.data.state !== "blocking"
        || parsed.data.transitionId !== input.transitionId
      ) {
        return "invalid";
      }
      journals.set(input.subjectIdentifier, {
        ...journal,
        status: "repairable",
        targetState: input.targetState,
        fence: 0,
      });
      const enteredAt = requireSafeTime(now());
      backlog.set(input.subjectIdentifier, enteredAt);
      backlogEnteredAt.set(input.subjectIdentifier, enteredAt);
      transitionBacklog.delete(input.subjectIdentifier);
      return "prepared";
    },
    async finalize(input): Promise<SubjectAccessFinalizeResult> {
      const journal = journals.get(input.subjectIdentifier);
      if (journal?.status === "finalized") {
        return journal.transitionId === input.transitionId
          && journal.targetState === input.targetState
          ? "already_finalized"
          : "wrong_transition";
      }
      if (
        journal?.status !== "repairable"
        || journal.transitionId !== input.transitionId
        || journal.targetState !== input.targetState
      ) {
        return "wrong_transition";
      }
      if (journal.lease !== undefined && requireSafeTime(now()) < journal.lease.until)
        return "wrong_transition";
      const current = records.get(input.subjectIdentifier);
      const parsedCurrent = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      const parsedTarget = parseSubjectAccessRecord(input.targetRecord);
      if (
        parsedCurrent === undefined
        || !parsedCurrent.success
        || parsedCurrent.data.state !== "blocking"
        || parsedCurrent.data.transitionId !== input.transitionId
        || !parsedTarget.success
        || parsedTarget.data.subjectIdentifier !== input.subjectIdentifier
        || parsedTarget.data.state !== input.targetState
        || parsedTarget.data.transitionId !== input.transitionId
      ) {
        return "invalid";
      }

      records.set(input.subjectIdentifier, input.targetRecord);
      journals.set(input.subjectIdentifier, {
        status: "finalized",
        transitionId: input.transitionId,
        targetState: input.targetState,
      });
      backlog.delete(input.subjectIdentifier);
      backlogEnteredAt.delete(input.subjectIdentifier);
      transitionBacklog.delete(input.subjectIdentifier);
      return "finalized";
    },
    async rollback(input): Promise<SubjectAccessRollbackResult> {
      const journal = journals.get(input.subjectIdentifier);
      if (journal?.status === "rolled_back") {
        return journal.transitionId === input.transitionId
          ? "already_rolled_back"
          : "wrong_transition";
      }
      if (
        journal?.status !== "mutating"
        || journal.transitionId !== input.transitionId
      ) {
        return "wrong_transition";
      }
      const current = records.get(input.subjectIdentifier);
      const parsed = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      if (
        parsed === undefined
        || !parsed.success
        || parsed.data.state !== "blocking"
        || parsed.data.transitionId !== input.transitionId
      ) {
        return "invalid";
      }

      if (journal.previousRecord === null)
        records.delete(input.subjectIdentifier);
      else
        records.set(input.subjectIdentifier, journal.previousRecord);
      journals.set(input.subjectIdentifier, {
        status: "rolled_back",
        transitionId: input.transitionId,
      });
      backlog.delete(input.subjectIdentifier);
      backlogEnteredAt.delete(input.subjectIdentifier);
      transitionBacklog.delete(input.subjectIdentifier);
      return "rolled_back";
    },
    async claimTransitionRecovery(input) {
      requirePositiveSafeInteger(
        input.leaseDurationMs,
        "transition recovery lease duration",
      );
      if (input.leaseToken.length === 0) {
        throw new RangeError(
          "Subject Access transition recovery lease token must not be empty",
        );
      }
      const claimedAt = requireSafeTime(now());
      while (true) {
        const candidate = [...transitionBacklog.entries()]
          .filter(([, dueAt]) => dueAt <= claimedAt)
          .sort(([leftSubject, leftScore], [rightSubject, rightScore]) =>
            leftScore - rightScore || leftSubject.localeCompare(rightSubject))
          .at(0);
        if (candidate === undefined)
          return null;
        const [subjectIdentifier] = candidate;
        const journal = journals.get(subjectIdentifier);
        const current = records.get(subjectIdentifier);
        const parsed = current === undefined
          ? undefined
          : parseSubjectAccessRecord(current);
        if (
          journal?.status !== "mutating"
          || parsed === undefined
          || !parsed.success
          || parsed.data.state !== "blocking"
          || parsed.data.transitionId !== journal.transitionId
        ) {
          transitionBacklog.delete(subjectIdentifier);
          continue;
        }
        const leaseUntil = safeAdd(claimedAt, input.leaseDurationMs);
        const fence = journal.recoveryFence + 1;
        journals.set(subjectIdentifier, {
          ...journal,
          recoveryFence: fence,
          recoveryLease: {
            token: input.leaseToken,
            until: leaseUntil,
          },
        });
        transitionBacklog.set(subjectIdentifier, leaseUntil);
        return {
          subjectIdentifier,
          transitionId: journal.transitionId,
          leaseToken: input.leaseToken,
          fence,
          leaseUntil,
        };
      }
    },
    async reconcileTransitionRecovery(input) {
      const currentTime = requireSafeTime(now());
      const journal = journals.get(input.lease.subjectIdentifier);
      if (!recoveryLeaseMatches(journal, input.lease))
        return "stale_lease";
      if (currentTime >= input.lease.leaseUntil)
        return "lease_expired";
      const current = records.get(input.lease.subjectIdentifier);
      const parsed = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      if (
        parsed === undefined
        || !parsed.success
        || parsed.data.state !== "blocking"
        || parsed.data.transitionId !== input.lease.transitionId
      ) {
        return "invalid";
      }

      if (input.resolution.status === "committed") {
        journals.set(input.lease.subjectIdentifier, {
          status: "repairable",
          transitionId: journal.transitionId,
          previousRecord: journal.previousRecord,
          targetState: input.resolution.targetState,
          fence: 0,
        });
        backlog.set(input.lease.subjectIdentifier, currentTime);
        backlogEnteredAt.set(input.lease.subjectIdentifier, currentTime);
        transitionBacklog.delete(input.lease.subjectIdentifier);
        return "prepared";
      }

      if (journal.previousRecord === null)
        records.delete(input.lease.subjectIdentifier);
      else
        records.set(input.lease.subjectIdentifier, journal.previousRecord);
      journals.set(input.lease.subjectIdentifier, {
        status: "rolled_back",
        transitionId: input.lease.transitionId,
      });
      backlog.delete(input.lease.subjectIdentifier);
      backlogEnteredAt.delete(input.lease.subjectIdentifier);
      transitionBacklog.delete(input.lease.subjectIdentifier);
      return "rolled_back";
    },
    async rescheduleTransitionRecovery(input) {
      requirePositiveSafeInteger(
        input.retryDelayMs,
        "transition recovery retry delay",
      );
      const currentTime = requireSafeTime(now());
      const journal = journals.get(input.lease.subjectIdentifier);
      if (!recoveryLeaseMatches(journal, input.lease))
        return "stale_lease";
      if (currentTime >= input.lease.leaseUntil)
        return "lease_expired";
      journals.set(input.lease.subjectIdentifier, {
        ...journal,
        recoveryLease: undefined,
      });
      transitionBacklog.set(
        input.lease.subjectIdentifier,
        safeAdd(currentTime, input.retryDelayMs),
      );
      return "rescheduled";
    },
    async inspectRepairBacklog() {
      const currentTime = requireSafeTime(now());
      const oldestEnteredAt = [...backlogEnteredAt.values()]
        .sort((left, right) => left - right)
        .at(0);
      return {
        count: backlog.size,
        oldestAgeMs: oldestEnteredAt === undefined
          ? null
          : Math.max(0, currentTime - oldestEnteredAt),
      };
    },
    async claimRepairSubject(input) {
      requirePositiveSafeInteger(input.leaseDurationMs, "repair lease duration");
      if (input.leaseToken.length === 0)
        throw new RangeError("Subject Access repair lease token must not be empty");
      const claimedAt = requireSafeTime(now());
      while (true) {
        const candidate = [...backlog.entries()]
          .filter(([subjectIdentifier, dueAt]) =>
            (
              dueAt <= claimedAt
              || input.subjectIdentifier === subjectIdentifier
            )
            && (
              input.subjectIdentifier === undefined
              || input.subjectIdentifier === subjectIdentifier
            ))
          .sort(([leftSubject, leftScore], [rightSubject, rightScore]) =>
            leftScore - rightScore || leftSubject.localeCompare(rightSubject))
          .at(0);
        if (candidate === undefined)
          return null;
        const [subjectIdentifier] = candidate;
        const journal = journals.get(subjectIdentifier);
        const current = records.get(subjectIdentifier);
        const parsed = current === undefined
          ? undefined
          : parseSubjectAccessRecord(current);
        if (
          journal?.status !== "repairable"
          || parsed === undefined
          || !parsed.success
          || parsed.data.state !== "blocking"
          || parsed.data.transitionId !== journal.transitionId
        ) {
          backlog.delete(subjectIdentifier);
          backlogEnteredAt.delete(subjectIdentifier);
          continue;
        }
        if (
          input.subjectIdentifier !== undefined
          && journal.lease !== undefined
          && claimedAt < journal.lease.until
        ) {
          return null;
        }
        const leaseUntil = safeAdd(claimedAt, input.leaseDurationMs);
        const fence = journal.fence + 1;
        journals.set(subjectIdentifier, {
          ...journal,
          fence,
          lease: {
            token: input.leaseToken,
            until: leaseUntil,
          },
        });
        backlog.set(subjectIdentifier, leaseUntil);
        return {
          subjectIdentifier,
          transitionId: journal.transitionId,
          targetState: journal.targetState,
          leaseToken: input.leaseToken,
          fence,
          leaseUntil,
        };
      }
    },
    async rescheduleRepairSubject(input): Promise<SubjectAccessRepairRescheduleResult> {
      requirePositiveSafeInteger(input.retryDelayMs, "repair retry delay");
      const currentTime = requireSafeTime(now());
      const journal = journals.get(input.lease.subjectIdentifier);
      if (!leaseMatches(journal, input.lease))
        return "stale_lease";
      if (currentTime >= input.lease.leaseUntil)
        return "lease_expired";
      const nextAttemptAt = safeAdd(currentTime, input.retryDelayMs);
      journals.set(input.lease.subjectIdentifier, {
        ...journal,
        lease: undefined,
      });
      backlog.set(input.lease.subjectIdentifier, nextAttemptAt);
      return "rescheduled";
    },
    async finalizeRepairSubject(input): Promise<SubjectAccessRepairFinalizeResult> {
      const currentTime = requireSafeTime(now());
      const journal = journals.get(input.lease.subjectIdentifier);
      if (!leaseMatches(journal, input.lease))
        return "stale_lease";
      if (currentTime >= input.lease.leaseUntil)
        return "lease_expired";
      const current = records.get(input.lease.subjectIdentifier);
      const parsedCurrent = current === undefined
        ? undefined
        : parseSubjectAccessRecord(current);
      const parsedTarget = parseSubjectAccessRecord(input.targetRecord);
      if (
        parsedCurrent === undefined
        || !parsedCurrent.success
        || parsedCurrent.data.state !== "blocking"
        || parsedCurrent.data.transitionId !== input.lease.transitionId
        || !parsedTarget.success
        || parsedTarget.data.subjectIdentifier !== input.lease.subjectIdentifier
        || parsedTarget.data.state !== input.lease.targetState
        || parsedTarget.data.transitionId !== input.lease.transitionId
      ) {
        return "invalid";
      }
      records.set(input.lease.subjectIdentifier, input.targetRecord);
      journals.set(input.lease.subjectIdentifier, {
        status: "finalized",
        transitionId: input.lease.transitionId,
        targetState: input.lease.targetState,
      });
      backlog.delete(input.lease.subjectIdentifier);
      backlogEnteredAt.delete(input.lease.subjectIdentifier);
      transitionBacklog.delete(input.lease.subjectIdentifier);
      return "finalized";
    },
  };
}

function leaseMatches(
  journal: TransitionJournal | undefined,
  lease: SubjectAccessRepairLease,
): journal is Extract<TransitionJournal, { status: "repairable" }> {
  return journal?.status === "repairable"
    && journal.transitionId === lease.transitionId
    && journal.targetState === lease.targetState
    && journal.fence === lease.fence
    && journal.lease?.token === lease.leaseToken
    && journal.lease.until === lease.leaseUntil;
}

function recoveryLeaseMatches(
  journal: TransitionJournal | undefined,
  lease: import("./transition-recovery").SubjectAccessTransitionRecoveryLease,
): journal is Extract<TransitionJournal, { status: "mutating" }> {
  return journal?.status === "mutating"
    && journal.transitionId === lease.transitionId
    && journal.recoveryFence === lease.fence
    && journal.recoveryLease?.token === lease.leaseToken
    && journal.recoveryLease.until === lease.leaseUntil;
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Subject Access ${name} must be a positive safe integer`);
  return value;
}

function requireSafeTime(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("Subject Access store clock must return a non-negative safe integer");
  return value;
}

function requireNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`Subject Access ${name} must be a non-negative safe integer`);
  return value;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result))
    throw new RangeError("Subject Access store time exceeded the safe integer range");
  return result;
}
