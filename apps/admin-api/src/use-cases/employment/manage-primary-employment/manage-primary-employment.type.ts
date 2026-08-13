import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export type ManagePrimaryEmploymentInput = {
  command: "set";
  employmentId: number;
} | {
  command: "clear";
  employmentId: number;
};

export interface ManagePrimaryEmploymentOptions {
  auditContext?: AdminAuditContext;
}
