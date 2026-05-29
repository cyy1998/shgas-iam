import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import * as auditService from "@admin-api/services/audit/audit.service";
import { defineQueryOp } from "@iam/api-core/core/business-op";

export const searchAuditLogsOp = defineQueryOp({
  input: AuditLogPaginationQueryDtoSchema,
  handler: input => auditService.searchAuditLogsForAdmin(input),
});
