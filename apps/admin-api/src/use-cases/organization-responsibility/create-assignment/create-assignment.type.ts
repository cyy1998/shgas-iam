import type { AdminOrganizationResponsibilityAuthorization } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityTypeCode } from "@iam/contracts";

export interface CreateOrganizationResponsibilityAssignmentInput {
  employmentId: number;
  targetOrganizationCode: string;
  typeCode: OrganizationResponsibilityTypeCode;
}

export interface CreateOrganizationResponsibilityAssignmentOptions {
  auditContext?: AdminAuditContext;
  authorization: AdminOrganizationResponsibilityAuthorization;
}
