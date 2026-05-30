import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { EmploymentStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { recordAdminResourceAudit } from "../admin-resource-audit";

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

export async function recordEmploymentAudit(
  action: string,
  target: EmploymentAuditTarget,
  details: Record<string, unknown>,
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await recordAdminResourceAudit(
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
    tx,
    auditContext,
  );
}

export async function recordEmploymentResignUserAudit(
  user: { id: number; username: string; name?: string | null },
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await recordAdminResourceAudit(
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
    tx,
    auditContext,
  );
}
