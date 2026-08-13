import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface TransferEmploymentInput {
  employmentId: number;
  newOrgCode: string;
  expectedAncestorOrgCode?: string;
  newPosCode: string;
  isPrimary: boolean;
  description?: string | null;
}

export interface TransferEmploymentOptions {
  auditContext?: AdminAuditContext;
}
