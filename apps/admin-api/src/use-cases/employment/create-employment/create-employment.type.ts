import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface CreateEmploymentInput {
  username: string;
  orgCode: string;
  expectedAncestorOrgCode?: string;
  posCode: string;
  isPrimary?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  description?: string | null;
}

export interface CreateEmploymentOptions {
  authorization?: AdminEmploymentAuthorization;
  auditContext?: AdminAuditContext;
}
