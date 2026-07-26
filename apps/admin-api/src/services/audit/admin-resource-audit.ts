import type { AdminAuditContext, AuditLogInput } from "./audit.context";

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

export function buildAdminResourceAudit(
  action: string,
  target: AdminAuditTarget,
  details: AuditLogInput["details"],
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return {
    ...resolveAuditContext(auditContext),
    action,
    outcome: "success",
    targetType: target.type,
    targetId: target.id ?? null,
    targetCode: target.code ?? null,
    targetName: target.name ?? null,
    details,
  };
}
