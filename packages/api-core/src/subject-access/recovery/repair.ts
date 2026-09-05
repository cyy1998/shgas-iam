import type { SubjectAccessBarrier } from "../barrier";
import type {
  SubjectAccessAtomicStore,
  SubjectAccessRepairLease,
} from "../storage/store";
import { randomUUID } from "node:crypto";

export interface SubjectAccessAuthorityState {
  readonly accountState: "enabled" | "disabled";
  readonly factsState: "current" | "not_current";
}

export interface SubjectAccessAuthorityPort {
  readonly resolve: (
    subjectIdentifier: string,
  ) => Promise<SubjectAccessAuthorityState>;
}

export interface SubjectAccessRepairLogger {
  readonly warn: (fields: Record<string, unknown>, message: string) => void;
}

export interface CreateSubjectAccessRepairOptions {
  readonly barrier: Pick<SubjectAccessBarrier, "finalizeRepair">;
  readonly backlog: Pick<
    SubjectAccessAtomicStore,
    "claimRepairSubject" | "rescheduleRepairSubject"
  >;
  readonly authority: SubjectAccessAuthorityPort;
  readonly logger: SubjectAccessRepairLogger;
  readonly random?: {
    readonly uuid: () => string;
  };
  readonly leaseDurationMs?: number;
  readonly authorityTimeoutMs?: number;
  readonly retryDelayMs?: number;
}

export type SubjectAccessRepairStatus
  = | "enabled"
    | "disabled"
    | "deferred"
    | "failed"
    | "stable";

export function createSubjectAccessRepair(options: CreateSubjectAccessRepairOptions) {
  const leaseDurationMs = requirePositiveSafeInteger(
    options.leaseDurationMs ?? 30_000,
    "leaseDurationMs",
  );
  const retryDelayMs = requirePositiveSafeInteger(
    options.retryDelayMs ?? 5_000,
    "retryDelayMs",
  );
  const authorityTimeoutMs = requirePositiveSafeInteger(
    options.authorityTimeoutMs ?? Math.max(1, Math.floor(leaseDurationMs / 2)),
    "authorityTimeoutMs",
  );
  if (authorityTimeoutMs >= leaseDurationMs) {
    throw new RangeError(
      "Subject Access authorityTimeoutMs must be shorter than leaseDurationMs",
    );
  }
  const uuid = options.random?.uuid ?? randomUUID;

  async function repairSubject(
    subjectIdentifier: string,
  ): Promise<{ status: SubjectAccessRepairStatus }> {
    let lease: SubjectAccessRepairLease | null;
    try {
      lease = await options.backlog.claimRepairSubject({
        leaseDurationMs,
        leaseToken: uuid(),
        subjectIdentifier,
      });
    }
    catch (error) {
      logFailure("claim", error, subjectIdentifier);
      return { status: "failed" };
    }
    if (lease === null)
      return { status: "deferred" };
    return {
      status: (await repairLease(lease)).status,
    };
  }

  async function repairLease(
    lease: SubjectAccessRepairLease,
  ): Promise<{ status: SubjectAccessRepairStatus; leaseLost: boolean }> {
    try {
      const authority = await withTimeout(
        options.authority.resolve(lease.subjectIdentifier),
        authorityTimeoutMs,
      );
      if (!authorityMatchesTarget(authority, lease.targetState)) {
        const rescheduled = await rescheduleRepairSubject(lease);
        return {
          status: "deferred",
          leaseLost: rescheduled !== "rescheduled",
        };
      }

      const finalized = await options.barrier.finalizeRepair(lease);
      if (finalized === "stale")
        return { status: "deferred", leaseLost: true };
      return { status: lease.targetState, leaseLost: false };
    }
    catch (error) {
      let leaseLost = false;
      try {
        leaseLost = await rescheduleRepairSubject(lease) !== "rescheduled";
      }
      catch (rescheduleError) {
        logFailure("reschedule", rescheduleError, lease.subjectIdentifier);
      }
      logFailure("repair", error, lease.subjectIdentifier);
      return { status: "failed", leaseLost };
    }
  }

  async function repairPending(input: { limit: number }) {
    const limit = requirePositiveSafeInteger(input.limit, "repair limit");
    const counts: Record<SubjectAccessRepairStatus, number> = {
      disabled: 0,
      enabled: 0,
      deferred: 0,
      failed: 0,
      stable: 0,
    };

    for (let index = 0; index < limit; index += 1) {
      let lease: SubjectAccessRepairLease | null;
      try {
        lease = await options.backlog.claimRepairSubject({
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
      const result = await repairLease(lease);
      counts[result.status] += 1;
      if (result.leaseLost)
        break;
    }
    return counts;
  }

  async function rescheduleRepairSubject(lease: SubjectAccessRepairLease) {
    const result = await options.backlog.rescheduleRepairSubject({
      lease,
      retryDelayMs,
    });
    if (result === "invalid")
      throw new TypeError("Subject Access repair reschedule was invalid");
    return result;
  }

  function logFailure(
    operation: "claim" | "repair" | "reschedule",
    error: unknown,
    subjectIdentifier?: string,
  ) {
    options.logger.warn({
      errorType: safeErrorType(error),
      operation,
      ...(subjectIdentifier === undefined ? {} : { subjectIdentifier }),
    }, `Subject Access repair ${operation === "claim" ? "backlog claim " : ""}failed`);
  }

  return {
    repairPending,
    repairSubject,
  };
}

class SubjectAccessAuthorityTimeoutError extends Error {
  constructor() {
    super("Subject Access authority deadline exceeded");
    this.name = "SubjectAccessAuthorityTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new SubjectAccessAuthorityTimeoutError()), timeoutMs);
      }),
    ]);
  }
  finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
  }
}

export type SubjectAccessRepair = ReturnType<typeof createSubjectAccessRepair>;

function authorityMatchesTarget(
  authority: SubjectAccessAuthorityState,
  targetState: "enabled" | "disabled",
) {
  if (targetState === "disabled")
    return authority.accountState === "disabled";
  return authority.accountState === "enabled" && authority.factsState === "current";
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
