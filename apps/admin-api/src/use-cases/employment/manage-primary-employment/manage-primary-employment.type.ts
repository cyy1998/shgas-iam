import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export type ManagePrimaryEmploymentInput = {
  command: "set";
  employmentId: number;
} | {
  command: "clear";
  employmentId: number;
};

export interface ManagePrimaryEmploymentOptions {
  authorization?: AdminEmploymentAuthorization;
  auditContext?: AdminAuditContext;
}
