import { randomUUID } from "node:crypto";

export interface SubjectAccessTransitionRecoveryLease {
  readonly subjectIdentifier: string;
  readonly transitionId: string;
  readonly leaseToken: string;
  readonly fence: number;
  readonly leaseUntil: number;
}

export type SubjectAccessTransitionResolution
  = | {
    readonly status: "committed";
    readonly targetState: "enabled" | "disabled";
  }
  | {
    readonly status: "rolled_back";
  }
  | {
    readonly status: "unresolved";
  };

export type SubjectAccessTransitionRecoveryReconcileResult
  = | "prepared"
    | "rolled_back"
    | "stale_lease"
    | "lease_expired"
    | "invalid";

export type SubjectAccessTransitionRecoveryRescheduleResult
  = | "rescheduled"
    | "stale_lease"
    | "lease_expired"
    | "invalid";

export interface SubjectAccessTransitionRecoveryBacklog {
  readonly claimTransitionRecovery: (input: {
    readonly leaseDurationMs: number;
    readonly leaseToken: string;
  }) => Promise<SubjectAccessTransitionRecoveryLease | null>;
  readonly reconcileTransitionRecovery: (input: {
    readonly lease: SubjectAccessTransitionRecoveryLease;
    readonly resolution: Exclude<
      SubjectAccessTransitionResolution,
      { status: "unresolved" }
    >;
  }) => Promise<SubjectAccessTransitionRecoveryReconcileResult>;
  readonly rescheduleTransitionRecovery: (input: {
    readonly lease: SubjectAccessTransitionRecoveryLease;
    readonly retryDelayMs: number;
  }) => Promise<SubjectAccessTransitionRecoveryRescheduleResult>;
}

export interface SubjectAccessTransitionRecoveryAuthority {
  readonly resolve: (input: {
    readonly subjectIdentifier: string;
    readonly transitionId: string;
  }) => Promise<SubjectAccessTransitionResolution>;
}

export interface CreateSubjectAccessTransitionRecoveryOptions {
  readonly authority: SubjectAccessTransitionRecoveryAuthority;
  readonly backlog: SubjectAccessTransitionRecoveryBacklog;
  readonly logger: {
    readonly warn: (fields: Record<string, unknown>, message: string) => void;
  };
  readonly random?: {
    readonly uuid: () => string;
  };
  readonly leaseDurationMs?: number;
  readonly retryDelayMs?: number;
}

export function createSubjectAccessTransitionRecovery(
  options: CreateSubjectAccessTransitionRecoveryOptions,
) {
  const leaseDurationMs = requirePositiveSafeInteger(
    options.leaseDurationMs ?? 30_000,
    "transition recovery lease duration",
  );
  const retryDelayMs = requirePositiveSafeInteger(
    options.retryDelayMs ?? 5_000,
    "transition recovery retry delay",
  );
  const uuid = options.random?.uuid ?? randomUUID;

  async function recoverPending(input: { readonly limit: number }) {
    const limit = requirePositiveSafeInteger(
      input.limit,
      "transition recovery limit",
    );
    const counts = {
      deferred: 0,
      failed: 0,
      prepared: 0,
      rolledBack: 0,
    };

    for (let index = 0; index < limit; index += 1) {
      let lease: SubjectAccessTransitionRecoveryLease | null;
      try {
        lease = await options.backlog.claimTransitionRecovery({
          leaseDurationMs,
          leaseToken: uuid(),
        });
      }
      catch (error) {
        logFailure("claim", error);
        counts.failed += 1;
        break;
      }
      if (lease === null)
        break;

      let resolution: SubjectAccessTransitionResolution;
      try {
        resolution = await options.authority.resolve({
          subjectIdentifier: lease.subjectIdentifier,
          transitionId: lease.transitionId,
        });
      }
      catch (error) {
        await rescheduleAfterFailure(lease);
        logFailure("resolve", error, lease);
        counts.failed += 1;
        continue;
      }
      if (resolution.status === "unresolved") {
        try {
          const rescheduled = await options.backlog.rescheduleTransitionRecovery({
            lease,
            retryDelayMs,
          });
          if (rescheduled === "invalid") {
            logFailure(
              "reschedule",
              new TypeError("invalid transition recovery reschedule"),
              lease,
            );
            counts.failed += 1;
          }
          else {
            counts.deferred += 1;
          }
        }
        catch (error) {
          logFailure("reschedule", error, lease);
          counts.failed += 1;
        }
        continue;
      }

      let reconciled: SubjectAccessTransitionRecoveryReconcileResult;
      try {
        reconciled = await options.backlog.reconcileTransitionRecovery({
          lease,
          resolution,
        });
      }
      catch (error) {
        await rescheduleAfterFailure(lease);
        logFailure("reconcile", error, lease);
        counts.failed += 1;
        continue;
      }
      if (reconciled === "prepared") {
        counts.prepared += 1;
      }
      else if (reconciled === "rolled_back") {
        counts.rolledBack += 1;
      }
      else if (reconciled === "invalid") {
        logFailure(
          "reconcile",
          new TypeError("invalid transition recovery reconciliation"),
          lease,
        );
        counts.failed += 1;
      }
      else {
        counts.deferred += 1;
      }
    }

    return counts;
  }

  async function rescheduleAfterFailure(
    lease: SubjectAccessTransitionRecoveryLease,
  ) {
    try {
      await options.backlog.rescheduleTransitionRecovery({
        lease,
        retryDelayMs,
      });
    }
    catch (error) {
      logFailure("reschedule", error, lease);
    }
  }

  function logFailure(
    operation: "claim" | "reconcile" | "reschedule" | "resolve",
    error: unknown,
    lease?: SubjectAccessTransitionRecoveryLease,
  ) {
    options.logger.warn({
      errorType: safeErrorType(error),
      operation,
      ...(lease === undefined
        ? {}
        : {
            subjectIdentifier: lease.subjectIdentifier,
            transitionId: lease.transitionId,
          }),
    }, "Subject Access transition recovery failed");
  }

  return { recoverPending };
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Subject Access ${name} must be a positive safe integer`);
  return value;
}

function safeErrorType(error: unknown) {
  if (typeof error !== "object" || error === null)
    return "UnknownError";
  try {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" && /^[A-Za-z][\w.-]{0,63}$/u.test(name)
      ? name
      : "UnknownError";
  }
  catch {
    return "UnknownError";
  }
}
