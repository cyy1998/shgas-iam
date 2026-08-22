import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { OrganizationResponsibilityAssignmentLifecycleChange } from "./organization-responsibility-parent-lifecycle.type";
import { buildOrganizationResponsibilityAssignmentLifecycleAudit } from "@admin-api/services/audit/events/organization-responsibility-assignment.audit";
import { ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS } from "@iam/contracts";
import { OrganizationHasOpenResponsibilityAssignmentError } from "@iam/domain/organization";

export interface CreateOrganizationResponsibilityParentLifecycleParticipantDeps {
  assignmentStore: {
    pauseEnabledAssignmentsForEmployment: (
      employmentId: number,
    ) => Promise<OrganizationResponsibilityAssignmentLifecycleChange[]>;
    endOpenAssignmentsForEmployment: (
      employmentId: number,
      endTime: Date,
    ) => Promise<OrganizationResponsibilityAssignmentLifecycleChange[]>;
    endOpenAssignmentsForUser: (
      userId: number,
      endTime: Date,
    ) => Promise<OrganizationResponsibilityAssignmentLifecycleChange[]>;
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
    auditContext?: AdminAuditContext;
  }) {
    const changes
      = await deps.assignmentStore.pauseEnabledAssignmentsForEmployment(
        input.employmentId,
      );
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
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes = await deps.assignmentStore.endOpenAssignmentsForEmployment(
      input.employmentId,
      input.endTime,
    );
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
    endTime: Date;
    auditContext?: AdminAuditContext;
  }) {
    const changes = await deps.assignmentStore.endOpenAssignmentsForUser(
      input.userId,
      input.endTime,
    );
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

  return {
    assertNoOpenAssignmentsTargetingOrganizationSubtree,
    endOpenAssignmentsForEmployment,
    endOpenAssignmentsForUserResignation,
    pauseEnabledAssignmentsForEmployment,
  };
}

export type OrganizationResponsibilityParentLifecycleParticipant = ReturnType<
  typeof createOrganizationResponsibilityParentLifecycleParticipant
>;
