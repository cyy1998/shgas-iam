import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { PositionStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { recordAdminResourceAudit } from "../admin-resource-audit";

export async function recordPositionAudit(
  action: string,
  position: { id?: number | null; posCode: string; posName: string; status?: PositionStatus },
  details: Record<string, unknown>,
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await recordAdminResourceAudit(
    action,
    {
      type: "position",
      id: position.id ?? null,
      code: position.posCode,
      name: position.posName,
    },
    {
      posCode: position.posCode,
      posName: position.posName,
      status: position.status,
      ...details,
    },
    tx,
    auditContext,
  );
}
