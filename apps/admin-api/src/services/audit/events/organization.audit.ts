import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { OrganizationStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { recordAdminResourceAudit } from "../admin-resource-audit";

export async function recordOrganizationAudit(
  action: string,
  organization: { id: number; orgCode: string; orgName: string; status?: OrganizationStatus },
  details: Record<string, unknown>,
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await recordAdminResourceAudit(
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
    tx,
    auditContext,
  );
}
