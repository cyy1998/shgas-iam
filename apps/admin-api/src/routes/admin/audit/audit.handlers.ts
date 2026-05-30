import type { z } from "zod";
import type { AuditRouteHandler } from "./audit.type";
import { defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import * as auditService from "@admin-api/services/audit/audit.service";
import { router } from "@iam/api-core/trpc";

const searchAuditLogs = defineAdminApiQueryOperation({
  input: AuditLogPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof AuditLogPaginationQueryDtoSchema>,
  handler: input => auditService.searchAuditLogsForAdmin(input),
});

export const auditLogsSearch = searchAuditLogs.toHandler<AuditRouteHandler<"auditLogsSearch">>();

export const auditAdminRouter = router({
  search: searchAuditLogs.toTRPC(),
});
