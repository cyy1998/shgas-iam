import type { OrganizationResponsibilityAssignmentStatus, OrganizationResponsibilityTypeCode } from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  OrganizationResponsibilityTypeCode as ResponsibilityTypeCode,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
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
  rebuildState: {
    version: string;
    reasonCodes: UserDocumentRebuildReason[];
    status: UserDocumentWorkStatus;
  } | null;
  document: {
    sourceVersion: string;
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
  readBack: (scenario: HrAdminOutcomeScenario) => Promise<HrAdminOutcomeReadBack>;
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
        version: readBack.rebuildState?.version ?? "",
      };
    }
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(
    "HR Admin journey outcome did not confirm responsibility, audit, invalidation, revocation, and denial facts",
  );
}

function matchesExpectedOutcome(actual: HrAdminOutcomeReadBack, expected: HrAdminOutcomeScenario) {
  return (
    actual.assignment !== null &&
    actual.assignment.status === AssignmentStatus.Disable &&
    actual.assignment.ended &&
    actual.assignment.typeCode === ResponsibilityTypeCode.Supervising &&
    actual.assignment.actorVisibleTargetCode === expected.hrResponsibilityTargetOrganizationCode &&
    actual.assignment.holderPositionCode === expected.responsibilityHolderPositionCode &&
    actual.assignmentAudits.length === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS.length &&
    actual.assignmentAudits.every(
      (audit, index) =>
        audit.action === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS[index] &&
        audit.actorUsername === expected.hrAdminUsername &&
        audit.outcome === "success",
    ) &&
    actual.rebuildState !== null &&
    BigInt(actual.rebuildState.version) > 1n &&
    actual.rebuildState.status === UserDocumentWorkStatus.Processed &&
    actual.rebuildState.reasonCodes.length === 1 &&
    actual.rebuildState.reasonCodes[0] === UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated &&
    actual.document !== null &&
    actual.document.sourceVersion === actual.rebuildState.version &&
    !actual.document.containsEndedTargetResponsibility &&
    actual.hiddenBlocker.count === 1 &&
    actual.hiddenBlocker.status === AssignmentStatus.Enable &&
    actual.deniedCombinationAssignments === 0 &&
    actual.deniedAssignmentAudits === 0 &&
    !actual.adminMixedRoleAssignmentExists &&
    !actual.secondScopeRoleAssignmentExists
  );
}
