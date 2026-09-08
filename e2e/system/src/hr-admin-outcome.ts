import type {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
} from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  UserProfileDirtyReason as DirtyReason,
  UserProfileDirtyStatus as DirtyStatus,
  OrganizationResponsibilityTypeCode as ResponsibilityTypeCode,
} from "@iam/contracts";

export const HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS = [
  "admin.organization_responsibility_assignment.create",
  "admin.organization_responsibility_assignment.pause",
  "admin.organization_responsibility_assignment.resume",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
] as const;

export interface HrAdminOutcomeReadBack {
  assignment: {
    id: number;
    status: OrganizationResponsibilityAssignmentStatus;
    ended: boolean;
    typeCode: OrganizationResponsibilityTypeCode;
    actorVisibleTargetCode: string;
    holderPositionCode: string;
  } | null;
  assignmentAudits: Array<{
    action: string;
    actorUsername: string | null;
    outcome: string;
  }>;
  dirty: {
    dirtyVersion: string;
    reasonCodes: UserProfileDirtyReason[];
    status: UserProfileDirtyStatus;
  } | null;
  profile: {
    sourceDirtyVersion: string;
    containsEndedTargetResponsibility: boolean;
  } | null;
  hiddenBlocker: {
    count: number;
    status: OrganizationResponsibilityAssignmentStatus | null;
  };
  deniedCombinationAssignments: number;
  deniedAssignmentAudits: number;
  adminMixedRoleAssignmentExists: boolean;
  secondScopeRoleAssignmentExists: boolean;
}

export interface HrAdminOutcomeScenario {
  runId: string;
  adminUsername: string;
  hrAdminUsername: string;
  hrAdminRoleCode: string;
  responsibilityHolderPositionCode: string;
  outsideResponsibilityHolderPositionCode: string;
  responsibilityTargetOrganizationCode: string;
  hrSecondScopeRootOrganizationCode: string;
  hrResponsibilityTargetOrganizationCode: string;
}

export interface HrAdminOutcomeOwner {
  readBack: (
    scenario: HrAdminOutcomeScenario,
  ) => Promise<HrAdminOutcomeReadBack>;
}

export async function verifyHrAdminOutcome(input: {
  owner: HrAdminOutcomeOwner;
  scenario: HrAdminOutcomeScenario;
  sleep?: (milliseconds: number) => Promise<unknown>;
  timeoutMs?: number;
}) {
  const sleep = input.sleep ?? Bun.sleep;
  const deadline = Date.now() + (input.timeoutMs ?? 30_000);
  do {
    const readBack = await input.owner.readBack(input.scenario);
    if (matchesExpectedOutcome(readBack, input.scenario)) {
      return {
        status: "passed" as const,
        assignmentId: readBack.assignment?.id ?? 0,
        dirtyVersion: readBack.dirty?.dirtyVersion ?? "",
      };
    }
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(
    "HR Admin journey outcome did not confirm responsibility, audit, invalidation, revocation, and denial facts",
  );
}

function matchesExpectedOutcome(
  actual: HrAdminOutcomeReadBack,
  expected: HrAdminOutcomeScenario,
) {
  return actual.assignment !== null
    && actual.assignment.status === AssignmentStatus.Disable
    && actual.assignment.ended
    && actual.assignment.typeCode === ResponsibilityTypeCode.Supervising
    && actual.assignment.actorVisibleTargetCode
    === expected.hrResponsibilityTargetOrganizationCode
    && actual.assignment.holderPositionCode
    === expected.responsibilityHolderPositionCode
    && actual.assignmentAudits.length
    === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS.length
    && actual.assignmentAudits.every((audit, index) =>
      audit.action === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS[index]
      && audit.actorUsername === expected.hrAdminUsername
      && audit.outcome === "success")
    && actual.dirty !== null
    && BigInt(actual.dirty.dirtyVersion) > 1n
    && actual.dirty.status === DirtyStatus.Processed
    && actual.dirty.reasonCodes.length === 1
    && actual.dirty.reasonCodes[0]
    === DirtyReason.OrganizationResponsibilityAssignmentUpdated
    && actual.profile !== null
    && actual.profile.sourceDirtyVersion === actual.dirty.dirtyVersion
    && !actual.profile.containsEndedTargetResponsibility
    && actual.hiddenBlocker.count === 1
    && actual.hiddenBlocker.status === AssignmentStatus.Enable
    && actual.deniedCombinationAssignments === 0
    && actual.deniedAssignmentAudits === 0
    && !actual.adminMixedRoleAssignmentExists
    && !actual.secondScopeRoleAssignmentExists;
}
