import { EmploymentStatus, isOpenEmploymentStatus } from "@iam/contracts";
import type { EmploymentPeriod } from "@iam/domain/employment/employment-date";

type OpenEmploymentStatus = Exclude<EmploymentStatus, EmploymentStatus.Disable>;

type LockedEmployment = EmploymentPeriod & {
  id: number;
  userId: number;
  isDelete: boolean;
  status: EmploymentStatus;
};

export type OpenEmploymentPatch = Partial<EmploymentPeriod & { status: OpenEmploymentStatus }>;

export interface LockedOpenEmploymentStorePort {
  updateEmploymentRecord: (id: number, patch: OpenEmploymentPatch) => Promise<{ id: number } | null>;
}

export function mustPauseEmploymentAssignments(fromStatus: EmploymentStatus, toStatus: OpenEmploymentStatus): boolean {
  return (
    (toStatus === EmploymentStatus.Pause && fromStatus !== EmploymentStatus.Pause) ||
    (fromStatus === EmploymentStatus.Enable && toStatus === EmploymentStatus.Pending)
  );
}

/** The caller locks the Employment and any required Assignment selection, and owns audit and Outbox. */
export async function updateLockedEmployment(
  store: LockedOpenEmploymentStorePort,
  input: {
    employment: LockedEmployment;
    status: OpenEmploymentStatus;
    period?: EmploymentPeriod;
    pauseSelectedAssignments?: () => Promise<boolean>;
  },
) {
  const { employment, status, pauseSelectedAssignments } = input;
  if (employment.isDelete || !isOpenEmploymentStatus(employment.status) || !isOpenEmploymentStatus(status))
    throw new Error("Locked Employment is not open");
  const previousPeriod = { startTime: employment.startTime, endTime: employment.endTime };
  const finalPeriod = input.period ?? previousPeriod;
  const patch: OpenEmploymentPatch = {};
  if (employment.status !== status) patch.status = status;
  if (previousPeriod.startTime !== finalPeriod.startTime) patch.startTime = finalPeriod.startTime;
  if (previousPeriod.endTime !== finalPeriod.endTime) patch.endTime = finalPeriod.endTime;
  const documentChanges: EmploymentLifecycleDocumentChange[] = [];
  const changed = Object.keys(patch).length > 0;
  if (changed) {
    const pauseAssignments = mustPauseEmploymentAssignments(employment.status, status);
    if (pauseAssignments && !pauseSelectedAssignments)
      throw new Error("Employment pause requires a locked Assignment selection");
    const updated = await store.updateEmploymentRecord(employment.id, patch);
    if (updated == null) throw new Error("Locked Employment update returned no row");
    documentChanges.push({ kind: "employment", userId: employment.userId });
    if (pauseAssignments && (await pauseSelectedAssignments?.()))
      documentChanges.push({ kind: "organization-responsibility-assignment", userId: employment.userId });
  }
  return { changed, documentChanges, fromStatus: employment.status, toStatus: status, previousPeriod, finalPeriod };
}

export interface LockedEmploymentEndStorePort {
  updateEmploymentRecord: (
    id: number,
    patch: EmploymentEndPeriod & { status: EmploymentStatus.Disable; isPrimary: false },
  ) => Promise<{ id: number } | null>;
}

type EmploymentEndPeriod = { startTime: string | null; endTime: string };

export interface EndedEmployment {
  employmentId: number;
  fromStatus: EmploymentStatus;
  toStatus: EmploymentStatus.Disable;
  previousPeriod: EmploymentPeriod;
  finalPeriod: EmploymentEndPeriod;
}

export type EmploymentLifecycleDocumentChange = {
  readonly kind: "employment" | "organization-responsibility-assignment";
  readonly userId: number;
};

/**
 * End the selected Employments and cascade within the caller's transaction.
 * The caller locks and validates the complete selection, supplies its Assignment
 * cascade, and uses the returned period changes for audit before recording document changes.
 */
export async function endLockedEmployments(
  store: LockedEmploymentEndStorePort,
  input: {
    userId: number;
    employments: readonly LockedEmployment[];
    operationDate: string;
    replacementStartTime?: string | null;
    endSelectedAssignments: () => Promise<boolean>;
  },
) {
  if (input.replacementStartTime !== undefined && input.employments.length !== 1)
    throw new Error("An Employment start date can be replaced only for a single Employment");
  const documentChanges: EmploymentLifecycleDocumentChange[] = [];
  const endedEmployments: EndedEmployment[] = [];
  for (const employment of input.employments) {
    if (employment.userId !== input.userId || employment.isDelete)
      throw new Error("Locked Employment does not belong to the end target");
    if (employment.status === EmploymentStatus.Disable) continue;
    if (!isOpenEmploymentStatus(employment.status)) throw new Error("Locked Employment has an invalid end state");
    const startTime = input.replacementStartTime === undefined ? employment.startTime : input.replacementStartTime;
    const finalPeriod = {
      startTime: startTime !== null && startTime >= input.operationDate ? null : startTime,
      endTime: input.operationDate,
    };
    const updated = await store.updateEmploymentRecord(employment.id, {
      status: EmploymentStatus.Disable,
      ...finalPeriod,
      isPrimary: false,
    });
    if (updated == null) throw new Error("Locked Employment end returned no row");
    endedEmployments.push({
      employmentId: employment.id,
      fromStatus: employment.status,
      toStatus: EmploymentStatus.Disable,
      previousPeriod: { startTime: employment.startTime, endTime: employment.endTime },
      finalPeriod,
    });
  }
  if (endedEmployments.length > 0) documentChanges.push({ kind: "employment", userId: input.userId });
  // Resignation can still have selected Assignments after every selected Employment is already ended.
  if (await input.endSelectedAssignments())
    documentChanges.push({ kind: "organization-responsibility-assignment", userId: input.userId });
  return { documentChanges, endedEmployments };
}
