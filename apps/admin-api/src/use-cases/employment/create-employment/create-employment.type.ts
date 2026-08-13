import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface CreateEmploymentInput {
  username: string;
  orgCode: string;
  expectedAncestorOrgCode?: string;
  posCode: string;
  isPrimary?: boolean;
  description?: string | null;
}

export interface CreateEmploymentOptions {
  auditContext?: AdminAuditContext;
}
