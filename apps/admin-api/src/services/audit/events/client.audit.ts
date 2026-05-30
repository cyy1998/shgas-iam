import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientDto } from "@admin-api/services/client/client.type";
import type { DbClient } from "@iam/db";
import { recordAdminResourceAudit } from "../admin-resource-audit";

export async function recordAdminClientAudit(
  action: string,
  clientDto: ClientDto,
  details: Record<string, unknown>,
  tx?: DbClient,
  auditContext?: AdminAuditContext,
) {
  await recordAdminResourceAudit(
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
    tx,
    auditContext,
  );
}
