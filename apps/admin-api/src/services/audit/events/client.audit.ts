import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientDto } from "@admin-api/services/client/client.type";
import type { AuditLogInput } from "../audit.service";
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
