import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { EmploymentStatus } from "@iam/contracts";
import { buildAdminResourceAudit } from "../admin-resource-audit";

type EmploymentAuditTarget = {
  id: number;
  userId?: number;
  posId?: number;
  orgId?: number;
  isPrimary?: boolean;
  status?: EmploymentStatus;
  user?: { name?: string | null; username: string };
  organization?: { assignedOrg?: { orgCode: string; orgName?: string | null } };
  position?: { posCode: string; posName?: string | null };
};

export function buildEmploymentAudit(
  action: string,
  target: EmploymentAuditTarget,
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    action,
    {
      type: "employment",
      id: target.id,
      name: target.user?.name ?? target.position?.posName ?? null,
    },
    {
      userId: target.userId,
      userName: target.user?.name,
      username: target.user?.username,
      posId: target.posId,
      posCode: target.position?.posCode,
      posName: target.position?.posName,
      orgId: target.orgId,
      orgCode: target.organization?.assignedOrg?.orgCode,
      orgName: target.organization?.assignedOrg?.orgName,
      isPrimary: target.isPrimary,
      status: target.status,
      ...details,
    },
    auditContext,
  );
}

export function buildEmploymentResignUserAudit(
  user: { id: number; username: string; name?: string | null },
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    "admin.employment.resign_user",
    {
      type: "user",
      id: user.id,
      code: user.username,
    },
    {
      username: user.username,
      resigned: true,
    },
    auditContext,
  );
}
