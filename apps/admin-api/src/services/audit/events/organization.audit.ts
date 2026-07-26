import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { OrganizationStatus } from "@iam/contracts";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export function buildOrganizationAudit(
  action: string,
  organization: { id: number; orgCode: string; orgName: string; status?: OrganizationStatus },
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    action,
    {
      type: "organization",
      id: organization.id,
      code: organization.orgCode,
      name: organization.orgName,
    },
    {
      orgCode: organization.orgCode,
      orgName: organization.orgName,
      status: organization.status,
      ...details,
    },
    auditContext,
  );
}
