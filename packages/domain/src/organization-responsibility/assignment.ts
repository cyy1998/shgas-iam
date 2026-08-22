import type {
  EmploymentStatus,
  OrganizationResponsibilityAssignmentLifecycleCommand,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import {
  EmploymentStatus as HolderEmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  OrganizationResponsibilityAssignmentStatus as ResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode as ResponsibilityTypeCode,
  OrganizationStatus as TargetOrganizationStatus,
} from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentDuplicateOpenError,
  OrganizationResponsibilityAssignmentNotOpenError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  OrganizationResponsibilityTargetOrganizationUnavailableError,
} from "./errors";

export interface OrganizationResponsibilityAssignmentRecordCreate {
  employmentId: number;
  targetOrganizationId: number;
  typeCode: OrganizationResponsibilityTypeCode;
  status: OrganizationResponsibilityAssignmentStatus;
  startTime: Date;
  endTime: null;
}

export type OrganizationResponsibilityAssignmentTransition
  = | { changed: false }
    | {
      changed: true;
      fromStatus: OrganizationResponsibilityAssignmentStatus;
      toStatus: OrganizationResponsibilityAssignmentStatus;
    };

export function resolveOrganizationResponsibilityAssignmentTransition(input: {
  command: OrganizationResponsibilityAssignmentLifecycleCommand;
  status: OrganizationResponsibilityAssignmentStatus;
}): OrganizationResponsibilityAssignmentTransition {
  const targetStatus
    = input.command === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause
      ? ResponsibilityAssignmentStatus.Pause
      : input.command === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume
        ? ResponsibilityAssignmentStatus.Enable
        : ResponsibilityAssignmentStatus.Disable;
  if (input.status === targetStatus)
    return { changed: false };
  if (input.status === ResponsibilityAssignmentStatus.Disable)
    throw new OrganizationResponsibilityAssignmentNotOpenError();
  return {
    changed: true,
    fromStatus: input.status,
    toStatus: targetStatus,
  };
}

export function assertOrganizationResponsibilityAssignmentResumeAvailable(input: {
  holderEmployment: {
    status: EmploymentStatus;
    isDelete: boolean;
  } | null;
  targetOrganization: {
    status: OrganizationStatus;
    isDelete: boolean;
  } | null;
}) {
  if (
    input.holderEmployment === null
    || input.holderEmployment.isDelete
    || input.holderEmployment.status !== HolderEmploymentStatus.Enable
  ) {
    throw new OrganizationResponsibilityHolderEmploymentUnavailableError();
  }
  if (
    input.targetOrganization === null
    || input.targetOrganization.isDelete
    || input.targetOrganization.status !== TargetOrganizationStatus.Enable
  ) {
    throw new OrganizationResponsibilityTargetOrganizationUnavailableError();
  }
}

interface OpenAssignmentSlot {
  id: number;
  employmentId: number;
}

export function assertOrganizationResponsibilityAssignmentSlotAvailable(input: {
  typeCode: OrganizationResponsibilityTypeCode;
  employmentId: number;
  existing: OpenAssignmentSlot | null;
}) {
  if (input.existing === null)
    return;
  if (
    input.typeCode === ResponsibilityTypeCode.Head
    && input.existing.employmentId !== input.employmentId
  ) {
    throw new OrganizationResponsibilityAssignmentCardinalityConflictError();
  }
  throw new OrganizationResponsibilityAssignmentDuplicateOpenError();
}

export type OrganizationResponsibilityOpenCardinalityViolation
  = "multiple-heads" | "duplicate-supervising-holder" | "missing-employment";

export type OrganizationResponsibilityParentLifecycleViolation
  = | "enabled-assignment-without-enabled-employment"
    | "open-assignment-with-ended-employment"
    | "open-assignment-without-enabled-target";

export function getOrganizationResponsibilityParentLifecycleViolation(input: {
  assignmentStatus: OrganizationResponsibilityAssignmentStatus;
  holderEmploymentStatus: EmploymentStatus | null;
  targetOrganizationStatus: OrganizationStatus | null;
}): OrganizationResponsibilityParentLifecycleViolation | null {
  if (input.assignmentStatus === ResponsibilityAssignmentStatus.Disable)
    return null;
  if (input.targetOrganizationStatus !== TargetOrganizationStatus.Enable)
    return "open-assignment-without-enabled-target";
  if (
    input.holderEmploymentStatus === null
    || input.holderEmploymentStatus === HolderEmploymentStatus.Disable
  ) {
    return "open-assignment-with-ended-employment";
  }
  if (
    input.assignmentStatus === ResponsibilityAssignmentStatus.Enable
    && input.holderEmploymentStatus !== HolderEmploymentStatus.Enable
  ) {
    return "enabled-assignment-without-enabled-employment";
  }
  return null;
}

export function getOrganizationResponsibilityOpenCardinalityViolation(
  rows: readonly {
    id: number;
    typeCode: OrganizationResponsibilityTypeCode;
    employmentId: number | null;
  }[],
): OrganizationResponsibilityOpenCardinalityViolation | null {
  let headCount = 0;
  const supervisingEmploymentIds = new Set<number>();
  for (const row of rows) {
    const { employmentId } = row;
    if (employmentId === null)
      return "missing-employment";
    if (row.typeCode === ResponsibilityTypeCode.Head) {
      headCount += 1;
      if (headCount > 1)
        return "multiple-heads";
      continue;
    }
    if (supervisingEmploymentIds.has(employmentId))
      return "duplicate-supervising-holder";
    supervisingEmploymentIds.add(employmentId);
  }
  return null;
}
