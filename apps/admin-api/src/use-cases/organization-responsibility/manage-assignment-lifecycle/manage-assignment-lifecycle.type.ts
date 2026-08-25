import type { AdminOrganizationResponsibilityAuthorization } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentLifecycleCommand } from "@iam/contracts";

export interface ManageOrganizationResponsibilityAssignmentLifecycleInput {
  id: number;
  command: OrganizationResponsibilityAssignmentLifecycleCommand;
}

export interface ManageOrganizationResponsibilityAssignmentLifecycleOptions {
  auditContext?: AdminAuditContext;
  authorization: AdminOrganizationResponsibilityAuthorization;
}
