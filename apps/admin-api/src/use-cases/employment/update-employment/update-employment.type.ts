import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { EmploymentUpdateDto } from "@admin-api/services/employment/employment.type";

export type UpdateEmploymentInput = EmploymentUpdateDto & { employmentId: number };

export interface UpdateEmploymentOptions {
  authorization?: AdminEmploymentAuthorization;
  auditContext?: AdminAuditContext;
}
