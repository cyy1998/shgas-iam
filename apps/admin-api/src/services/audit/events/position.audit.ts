import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { PositionStatus } from "@iam/contracts";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export function buildPositionAudit(
  action: string,
  position: { id?: number | null; posCode: string; posName: string; status?: PositionStatus },
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
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
    auditContext,
  );
}
