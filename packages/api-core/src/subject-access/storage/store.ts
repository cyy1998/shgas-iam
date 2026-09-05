import type { SubjectAccessTransitionRecoveryBacklog } from "../recovery/transition-recovery";

export type SubjectAccessBeginResult
  = | {
    status: "transitioned" | "already_transitioning";
    previousCommittedTransitionId: string | null;
  }
  | "conflict"
  | "invalid";

export type SubjectAccessAbortBeginResult
  = | "aborted"
    | "already_aborted"
    | "not_started"
    | "wrong_transition"
    | "invalid";

export type SubjectAccessFinalizeResult
  = | "finalized"
    | "already_finalized"
    | "wrong_transition"
    | "invalid";

export type SubjectAccessPrepareRepairResult
  = | "prepared"
    | "already_prepared"
    | "wrong_transition"
    | "invalid";

export type SubjectAccessRollbackResult
  = | "rolled_back"
    | "already_rolled_back"
    | "wrong_transition"
    | "invalid";

export type SubjectAccessRepairRescheduleResult
  = | "rescheduled"
    | "stale_lease"
    | "lease_expired"
    | "invalid";

export type SubjectAccessRepairFinalizeResult
  = | "finalized"
    | "stale_lease"
    | "lease_expired"
    | "invalid";

export interface SubjectAccessRepairLease {
  readonly subjectIdentifier: string;
  readonly transitionId: string;
  readonly targetState: "enabled" | "disabled";
  readonly leaseToken: string;
  readonly fence: number;
  readonly leaseUntil: number;
}

export interface SubjectAccessRepairBacklogMetrics {
  readonly count: number;
  readonly oldestAgeMs: number | null;
}

export interface SubjectAccessAtomicStore
  extends SubjectAccessTransitionRecoveryBacklog {
  read: (subjectIdentifier: string) => Promise<string | null>;
  abortBegin: (input: {
    subjectIdentifier: string;
    transitionId: string;
  }) => Promise<SubjectAccessAbortBeginResult>;
  beginBlocking: (input: {
    subjectIdentifier: string;
    transitionId: string;
    blockingRecord: string;
  }) => Promise<SubjectAccessBeginResult>;
  prepareRepair: (input: {
    subjectIdentifier: string;
    transitionId: string;
    targetState: "enabled" | "disabled";
  }) => Promise<SubjectAccessPrepareRepairResult>;
  finalize: (input: {
    subjectIdentifier: string;
    transitionId: string;
    targetState: "enabled" | "disabled";
    targetRecord: string;
  }) => Promise<SubjectAccessFinalizeResult>;
  rollback: (input: {
    subjectIdentifier: string;
    transitionId: string;
  }) => Promise<SubjectAccessRollbackResult>;
  inspectRepairBacklog: () => Promise<SubjectAccessRepairBacklogMetrics>;
  claimRepairSubject: (input: {
    leaseDurationMs: number;
    leaseToken: string;
    subjectIdentifier?: string;
  }) => Promise<SubjectAccessRepairLease | null>;
  rescheduleRepairSubject: (input: {
    lease: SubjectAccessRepairLease;
    retryDelayMs: number;
  }) => Promise<SubjectAccessRepairRescheduleResult>;
  finalizeRepairSubject: (input: {
    lease: SubjectAccessRepairLease;
    targetRecord: string;
  }) => Promise<SubjectAccessRepairFinalizeResult>;
}
