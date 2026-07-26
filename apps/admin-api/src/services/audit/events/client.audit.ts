import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { ClientDto } from "@admin-api/services/client/client.type";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export function buildAdminClientAudit(
  action: string,
  clientDto: ClientDto,
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
