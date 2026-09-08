import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type {
  OrganizationResponsibilityAssignmentLifecycleChange,
  OrganizationResponsibilityAssignmentWriteTarget,
} from "./organization-responsibility-parent-lifecycle.type";
import { buildOrganizationResponsibilityAssignmentLifecycleAudit } from "@admin-api/services/audit/events/organization-responsibility-assignment.audit";
import { ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS, OrganizationResponsibilityAssignmentStatus } from "@iam/contracts";
import { OrganizationHasOpenResponsibilityAssignmentError } from "@iam/domain/organization";

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
    hasOpenAssignmentTargetingOrganizationSubtree: (
      organizationId: number,
    ) => Promise<boolean>;
  };
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
}

export function createOrganizationResponsibilityParentLifecycleParticipant(
  deps: CreateOrganizationResponsibilityParentLifecycleParticipantDeps,
) {
  async function pauseEnabledAssignmentsForEmployment(input: {
    employmentId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    auditContext?: AdminAuditContext;
  }) {
    const changes = await applySelectedAssignments(input.selectedAssignments, input.employmentId, "pause", null);
    for (const change of changes) {
      await deps.auditLogWriter.recordAuditLog(
        buildOrganizationResponsibilityAssignmentLifecycleAudit({
          action: ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.pause,
          assignment: change,
          before: {
            status: change.beforeStatus,
            startTime: change.startTime,
            endTime: change.beforeEndTime,
          },
          after: {
            status: change.afterStatus,
            startTime: change.startTime,
            endTime: change.afterEndTime,
          },
          cause: {
            kind: "employment",
            action: "pause",
            employmentId: input.employmentId,
          },
          auditContext: input.auditContext,
        }),
      );
    }
    return changes.length > 0;
  }

  async function assertNoOpenAssignmentsTargetingOrganizationSubtree(input: {
    organizationId: number;
  }) {
    if (
      await deps.assignmentStore.hasOpenAssignmentTargetingOrganizationSubtree(
        input.organizationId,
      )
    ) {
      throw new OrganizationHasOpenResponsibilityAssignmentError();
    }
  }

  async function endOpenAssignmentsForEmployment(input: {
    action: "end" | "transfer";
    employmentId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes = await applySelectedAssignments(input.selectedAssignments, input.employmentId, "end", input.endTime);
    for (const change of changes) {
      await deps.auditLogWriter.recordAuditLog(
        buildOrganizationResponsibilityAssignmentLifecycleAudit({
          action: ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.end,
          assignment: change,
          before: {
            status: change.beforeStatus,
            startTime: change.startTime,
            endTime: change.beforeEndTime,
          },
          after: {
            status: change.afterStatus,
            startTime: change.startTime,
            endTime: change.afterEndTime,
          },
          cause: {
            kind: "employment",
            action: input.action,
            employmentId: input.employmentId,
          },
          auditContext: input.auditContext,
        }),
      );
    }
    return changes.length > 0;
  }

  async function endOpenAssignmentsForUserResignation(input: {
    userId: number;
    selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes: OrganizationResponsibilityAssignmentLifecycleChange[] = [];
    for (const assignment of input.selectedAssignments) {
      changes.push(...await applySelectedAssignments([assignment], assignment.employmentId, "end", input.endTime));
    }
    for (const change of changes) {
      await deps.auditLogWriter.recordAuditLog(
        buildOrganizationResponsibilityAssignmentLifecycleAudit({
          action: ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.end,
          assignment: change,
          before: {
            status: change.beforeStatus,
            startTime: change.startTime,
            endTime: change.beforeEndTime,
          },
          after: {
            status: change.afterStatus,
            startTime: change.startTime,
            endTime: change.afterEndTime,
          },
          cause: {
            kind: "user",
            action: "resignation",
            userId: input.userId,
          },
          auditContext: input.auditContext,
        }),
      );
    }
    return changes.length > 0;
  }

  async function applySelectedAssignments(
    assignments: readonly OrganizationResponsibilityAssignmentWriteTarget[],
    employmentId: number,
    command: "pause" | "end",
    endTime: Date | null,
  ) {
    const changes: OrganizationResponsibilityAssignmentLifecycleChange[] = [];
    for (const assignment of assignments) {
      if (assignment.employmentId !== employmentId)
        throw new Error("Locked Assignment does not belong to the selected Employment");
      const applicable = command === "pause"
        ? assignment.status === OrganizationResponsibilityAssignmentStatus.Enable
        : assignment.status === OrganizationResponsibilityAssignmentStatus.Enable
          || assignment.status === OrganizationResponsibilityAssignmentStatus.Pause;
      if (!applicable)
        continue;
      changes.push(await deps.assignmentStore.updateLockedAssignmentLifecycle({
        assignment,
        status: command === "pause"
          ? OrganizationResponsibilityAssignmentStatus.Pause
          : OrganizationResponsibilityAssignmentStatus.Disable,
        endTime: command === "pause" ? assignment.endTime : endTime,
      }));
    }
    return changes;
  }

  return {
    lockAssignmentsForEmployment: deps.assignmentStore.lockAssignmentsForEmployment,
    lockAssignmentsForEmployments: deps.assignmentStore.lockAssignmentsForEmployments,
    assertNoOpenAssignmentsTargetingOrganizationSubtree,
    endOpenAssignmentsForEmployment,
    endOpenAssignmentsForUserResignation,
    pauseEnabledAssignmentsForEmployment,
  };
}

export type OrganizationResponsibilityParentLifecycleParticipant = ReturnType<
  typeof createOrganizationResponsibilityParentLifecycleParticipant
>;
