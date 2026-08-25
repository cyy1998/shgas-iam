import type {
  AdminAuthorizationReasonCode,
  AdminOrganizationAllowedActions,
  OrganizationLevel,
  OrganizationStatus,
} from "@iam/contracts";
import type { AdminOperationId } from "./admin-operation.registry";

export interface AdminOrganizationActionFacts {
  status: OrganizationStatus;
  level: OrganizationLevel;
  childrenCount: number;
  employmentCount: number;
  hasOpenResponsibilityAssignment: boolean;
  hasUnmanageableOpenResponsibilityAssignment: boolean;
}

export interface AdminOrganizationMutationDenial {
  operationId: Extract<AdminOperationId, | "admin.organization.create"
  | "admin.organization.update"
  | "admin.organization.updateStatus"
  | "admin.organization.delete">;
  resourceIdentifier: string | null;
  reason: AdminAuthorizationReasonCode;
  concealExistence?: boolean;
}

export type AdminOrganizationAuthorization = {
  kind: "full";
  rootOrganizationIds: null;
  organizationIds: null;
  getAllowedActions: (facts: AdminOrganizationActionFacts) => AdminOrganizationAllowedActions;
  denyMutation: (input: AdminOrganizationMutationDenial) => never;
} | {
  kind: "scoped";
  rootOrganizationIds: readonly number[];
  organizationIds: readonly number[];
  getAllowedActions: (facts: AdminOrganizationActionFacts) => AdminOrganizationAllowedActions;
  denyMutation: (input: AdminOrganizationMutationDenial) => never;
};
