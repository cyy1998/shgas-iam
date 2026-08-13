import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface EndEmploymentInput {
  employmentId: number;
}

export interface EndEmploymentOptions {
  auditContext?: AdminAuditContext;
}
