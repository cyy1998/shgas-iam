import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export type ChangeEmploymentAvailabilityInput
  = | {
    command: "pause";
    employmentId: number;
  }
  | {
    command: "resume";
    employmentId: number;
    expectedAncestorOrgCode: string;
  };

export interface ChangeEmploymentAvailabilityOptions {
  auditContext?: AdminAuditContext;
}
