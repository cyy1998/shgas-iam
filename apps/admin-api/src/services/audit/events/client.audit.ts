import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export function buildAdminClientAudit(
  action: string,
  clientDto: GenericClientRuntimeDto,
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    action,
    {
      type: "client",
      id: clientDto.id,
      code: clientDto.clientCode,
      name: clientDto.clientName,
    },
    {
      clientCode: clientDto.clientCode,
      clientName: clientDto.clientName,
      status: clientDto.status,
      ...details,
    },
    auditContext,
  );
}
