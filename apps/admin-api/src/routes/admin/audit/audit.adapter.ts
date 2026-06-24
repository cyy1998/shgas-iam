import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { z } from "zod";
import type { AuditRouteHandler } from "./audit.type";
import { defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import { router } from "@iam/api-core/trpc";

export interface CreateAuditAdapterDeps {
  auditService: Pick<AdminAuditService, "searchAuditLogsForAdmin">;
}

export function createAuditAdapter(deps: CreateAuditAdapterDeps) {
  const searchAuditLogs = defineAdminApiQueryOperation({
    input: AuditLogPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof AuditLogPaginationQueryDtoSchema>,
    handler: input => deps.auditService.searchAuditLogsForAdmin(input),
  });

  const auditAdminRouter = router({
    search: searchAuditLogs.toTRPC(),
  });

  return {
    auditAdminRouter,
    auditLogsSearch: searchAuditLogs.toHandler<AuditRouteHandler<"auditLogsSearch">>(),
  };
}

export type AuditAdapter = ReturnType<typeof createAuditAdapter>;
