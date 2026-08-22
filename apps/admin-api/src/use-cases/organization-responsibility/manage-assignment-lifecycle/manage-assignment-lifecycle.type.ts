import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentLifecycleCommand } from "@iam/contracts";

export interface ManageOrganizationResponsibilityAssignmentLifecycleInput {
  id: number;
  command: OrganizationResponsibilityAssignmentLifecycleCommand;
}

export interface ManageOrganizationResponsibilityAssignmentLifecycleOptions {
  auditContext?: AdminAuditContext;
}
