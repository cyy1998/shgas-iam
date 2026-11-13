import { OrganizationResponsibilityAssignmentStatus, type OrganizationResponsibilityTypeCode } from "@iam/contracts";

/** Current rows returned only after the complete selected Assignment set is locked. */
export interface OrganizationResponsibilityAssignmentWriteTarget {
  id: number;
  employmentId: number;
  targetOrganizationId: number;
  typeCode: OrganizationResponsibilityTypeCode;
  status: OrganizationResponsibilityAssignmentStatus;
  startTime: Date;
  endTime: Date | null;
}

export interface OrganizationResponsibilityAssignmentLifecycleChange {
  id: number;
  employmentId: number;
  targetOrganizationId: number;
  typeCode: OrganizationResponsibilityTypeCode;
  startTime: Date;
  beforeStatus: OrganizationResponsibilityAssignmentStatus;
  beforeEndTime: Date | null;
  afterStatus: OrganizationResponsibilityAssignmentStatus;
  afterEndTime: Date | null;
}

export type ResponsibilityAssignmentCascadeCause =
  | { kind: "employment"; action: "pause" | "end" | "transfer" | "resume" | "editPeriod"; employmentId: number }
  | { kind: "user"; action: "resignation"; userId: number };

export function buildResponsibilityAssignmentCascadeAuditDetails(
  change: OrganizationResponsibilityAssignmentLifecycleChange,
  cause: ResponsibilityAssignmentCascadeCause,
) {
  return {
    binding: {
      employmentId: change.employmentId,
      targetOrganizationId: change.targetOrganizationId,
      typeCode: change.typeCode,
    },
    changed: true,
    before: { status: change.beforeStatus, startTime: change.startTime, endTime: change.beforeEndTime },
    after: { status: change.afterStatus, startTime: change.startTime, endTime: change.afterEndTime },
    cause,
  };
}

export interface LockedAssignmentEndStorePort {
  updateLockedAssignmentLifecycle: (input: {
    assignment: OrganizationResponsibilityAssignmentWriteTarget;
    status: OrganizationResponsibilityAssignmentStatus.Disable;
    endTime: Date;
  }) => Promise<OrganizationResponsibilityAssignmentLifecycleChange>;
}

/** End only the locked Assignments that are still Open and return the changes for caller-owned audit. */
export async function endLockedResponsibilityAssignments(
  store: LockedAssignmentEndStorePort,
  input: {
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    endTime: Date;
    employmentId?: number;
  },
): Promise<OrganizationResponsibilityAssignmentLifecycleChange[]> {
  const changes: OrganizationResponsibilityAssignmentLifecycleChange[] = [];
  for (const assignment of input.selectedAssignments) {
    if (input.employmentId !== undefined && assignment.employmentId !== input.employmentId)
      throw new Error("Locked Assignment does not belong to the selected Employment");
    if (
      assignment.status !== OrganizationResponsibilityAssignmentStatus.Enable &&
      assignment.status !== OrganizationResponsibilityAssignmentStatus.Pause
    ) {
      continue;
    }
    changes.push(
      await store.updateLockedAssignmentLifecycle({
        assignment,
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        endTime: input.endTime,
      }),
    );
  }
  return changes;
}
