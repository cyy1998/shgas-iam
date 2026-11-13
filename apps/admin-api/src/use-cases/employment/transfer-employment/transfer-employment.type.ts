import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface TransferEmploymentInput {
  employmentId: number;
  newOrgCode: string;
  expectedAncestorOrgCode?: string;
  newPosCode: string;
  isPrimary: boolean;
  endTime?: string | null;
  description?: string | null;
}

export interface TransferEmploymentOptions {
  authorization?: AdminEmploymentAuthorization;
  auditContext?: AdminAuditContext;
}
