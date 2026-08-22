import type {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";
import type { OrganizationResponsibilityAssignmentRecordCreate } from "@iam/domain/organization-responsibility";
import type { AdminAuditContext, AuditLogInput } from "../audit.context";
import { ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS } from "@iam/contracts";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export function buildOrganizationResponsibilityAssignmentCreateAudit(
  assignment: OrganizationResponsibilityAssignmentRecordCreate & { id: number },
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.create,
    {
      type: "organization_responsibility_assignment",
      id: assignment.id,
    },
    {
      binding: {
        employmentId: assignment.employmentId,
        targetOrganizationId: assignment.targetOrganizationId,
        typeCode: assignment.typeCode,
      },
      before: null,
      after: {
        status: assignment.status,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      },
      cause: "direct",
    },
    auditContext,
  );
}

type OrganizationResponsibilityLifecycleAuditAction
  = (typeof ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS)[Exclude<
    keyof typeof ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS,
    "create"
  >];

interface OrganizationResponsibilityLifecycleAuditState {
  status: OrganizationResponsibilityAssignmentStatus;
  startTime: Date;
  endTime: Date | null;
}

export type OrganizationResponsibilityAssignmentLifecycleAuditCause
  = | "direct"
    | {
      kind: "employment";
      action: "pause" | "end" | "transfer";
      employmentId: number;
    }
    | {
      kind: "user";
      action: "resignation";
      userId: number;
    };

export function buildOrganizationResponsibilityAssignmentLifecycleAudit(input: {
  action: OrganizationResponsibilityLifecycleAuditAction;
  assignment: {
    id: number;
    employmentId: number;
    targetOrganizationId: number;
    typeCode: OrganizationResponsibilityTypeCode;
  };
  before: OrganizationResponsibilityLifecycleAuditState;
  after: OrganizationResponsibilityLifecycleAuditState;
  cause?: OrganizationResponsibilityAssignmentLifecycleAuditCause;
  auditContext?: AdminAuditContext;
}): AuditLogInput {
  return buildAdminResourceAudit(
    input.action,
    {
      type: "organization_responsibility_assignment",
      id: input.assignment.id,
    },
    {
      binding: {
        employmentId: input.assignment.employmentId,
        targetOrganizationId: input.assignment.targetOrganizationId,
        typeCode: input.assignment.typeCode,
      },
      before: input.before,
      after: input.after,
      cause: input.cause ?? "direct",
    },
    input.auditContext,
  );
}
