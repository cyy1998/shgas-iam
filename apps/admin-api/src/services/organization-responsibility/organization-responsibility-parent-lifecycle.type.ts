import type {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";

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
