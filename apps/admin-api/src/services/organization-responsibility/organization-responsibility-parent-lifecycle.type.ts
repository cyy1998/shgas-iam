import type {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";

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
