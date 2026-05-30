import type { DbClient } from "@iam/db";
import type { AdminAuditContext, AuditLogInput } from "./audit.service";
import * as auditService from "./audit.service";

type AdminAuditTarget = {
  type: string;
  id?: number | null;
  code?: string | null;
  name?: string | null;
};

function resolveAuditContext(auditContext?: AdminAuditContext): AdminAuditContext {
  return auditContext ?? {
    actorType: "system",
    actorSystemKey: "admin-api",
  };
}

export async function recordAdminResourceAudit(
  action: string,
  target: AdminAuditTarget,
  details: AuditLogInput["details"],
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await auditService.recordAuditLog({
    ...resolveAuditContext(auditContext),
    action,
    outcome: "success",
    targetType: target.type,
    targetId: target.id ?? null,
    targetCode: target.code ?? null,
    targetName: target.name ?? null,
    details,
  }, tx);
}
