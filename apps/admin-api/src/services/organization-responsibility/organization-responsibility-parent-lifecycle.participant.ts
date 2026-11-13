import { buildAdminResourceAudit } from "@admin-api/services/audit/admin-resource-audit";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import {
  buildResponsibilityAssignmentCascadeAuditDetails,
  endLockedResponsibilityAssignments,
  type OrganizationResponsibilityAssignmentLifecycleChange,
  type OrganizationResponsibilityAssignmentWriteTarget,
  type ResponsibilityAssignmentCascadeCause,
} from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import { createOrganizationResponsibilityParentLifecycleGuard } from "@iam/assignment-resolution/organization-responsibility/parent-lifecycle";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS,
  OrganizationResponsibilityAssignmentStatus,
} from "@iam/contracts";

export interface CreateOrganizationResponsibilityParentLifecycleParticipantDeps {
  assignmentStore: {
    lockAssignmentsForEmployments: (input: {
      employmentIds: readonly number[];
      command: "pause" | "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    lockAssignmentsForEmployment: (input: {
      employmentId: number;
      command: "pause" | "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    updateLockedAssignmentLifecycle: (input: {
      assignment: OrganizationResponsibilityAssignmentWriteTarget;
      status: OrganizationResponsibilityAssignmentStatus;
      endTime: Date | null;
    }) => Promise<OrganizationResponsibilityAssignmentLifecycleChange>;
    hasOpenAssignmentTargetingOrganizationSubtree: (organizationId: number) => Promise<boolean>;
  };
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
}

export function createOrganizationResponsibilityParentLifecycleParticipant(
  deps: CreateOrganizationResponsibilityParentLifecycleParticipantDeps,
) {
  const organizationGuard = createOrganizationResponsibilityParentLifecycleGuard(deps.assignmentStore);
  async function recordCascade(
    changes: readonly OrganizationResponsibilityAssignmentLifecycleChange[],
    action: (typeof ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS)["pause" | "end"],
    cause: ResponsibilityAssignmentCascadeCause,
    auditContext?: AdminAuditContext,
    eventTime?: Date,
  ) {
    for (const change of changes) {
      await deps.auditLogWriter.recordAuditLog(
        buildAdminResourceAudit(
          action,
          { type: "organization_responsibility_assignment", id: change.id },
          buildResponsibilityAssignmentCascadeAuditDetails(change, cause),
          auditContext,
          eventTime,
        ),
      );
    }
    return changes.length > 0;
  }

  async function pauseEnabledAssignmentsForEmployment(input: {
    action?: "editPeriod";
    employmentId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    auditContext?: AdminAuditContext;
    eventTime?: Date;
  }) {
    const changes = await pauseSelectedAssignments(input.selectedAssignments, input.employmentId);
    return await recordCascade(
      changes,
      ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.pause,
      { kind: "employment", action: input.action ?? "pause", employmentId: input.employmentId },
      input.auditContext,
      input.eventTime,
    );
  }

  async function endOpenAssignmentsForEmployment(input: {
    action: "end" | "transfer" | "resume" | "editPeriod";
    employmentId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes = await endLockedResponsibilityAssignments(deps.assignmentStore, input);
    return await recordCascade(
      changes,
      ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.end,
      { kind: "employment", action: input.action, employmentId: input.employmentId },
      input.auditContext,
      input.endTime,
    );
  }

  async function endOpenAssignmentsForUserResignation(input: {
    userId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes = await endLockedResponsibilityAssignments(deps.assignmentStore, input);
    return await recordCascade(
      changes,
      ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.end,
      { kind: "user", action: "resignation", userId: input.userId },
      input.auditContext,
      input.endTime,
    );
  }

  async function pauseSelectedAssignments(
    assignments: readonly OrganizationResponsibilityAssignmentWriteTarget[],
    employmentId: number,
  ) {
    const changes: OrganizationResponsibilityAssignmentLifecycleChange[] = [];
    for (const assignment of assignments) {
      if (assignment.employmentId !== employmentId)
        throw new Error("Locked Assignment does not belong to the selected Employment");
      if (assignment.status !== OrganizationResponsibilityAssignmentStatus.Enable) continue;
      changes.push(
        await deps.assignmentStore.updateLockedAssignmentLifecycle({
          assignment,
          status: OrganizationResponsibilityAssignmentStatus.Pause,
          endTime: assignment.endTime,
        }),
      );
    }
    return changes;
  }

  return {
    lockAssignmentsForEmployment: deps.assignmentStore.lockAssignmentsForEmployment,
    lockAssignmentsForEmployments: deps.assignmentStore.lockAssignmentsForEmployments,
    assertNoOpenAssignmentsTargetingOrganizationSubtree:
      organizationGuard.assertNoOpenAssignmentsTargetingOrganizationSubtree,
    endOpenAssignmentsForEmployment,
    endOpenAssignmentsForUserResignation,
    pauseEnabledAssignmentsForEmployment,
  };
}

export type OrganizationResponsibilityParentLifecycleParticipant = ReturnType<
  typeof createOrganizationResponsibilityParentLifecycleParticipant
>;
