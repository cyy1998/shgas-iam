import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";

export interface ResignUserInput {
  username: string;
}

export interface ResignUserOptions {
  auditContext?: AdminAuditContext;
}
