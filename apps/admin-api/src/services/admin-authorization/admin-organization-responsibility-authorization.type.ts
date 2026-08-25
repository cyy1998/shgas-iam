import type {
  AdminAuthorizationReasonCode,
  AdminOrganizationResponsibilityAllowedActions,
  OrganizationResponsibilityAssignmentLifecycleCommand,
  OrganizationResponsibilityAssignmentStatus,
} from "@iam/contracts";
import type { AdminOperationId } from "./admin-operation.registry";

export type AdminOrganizationResponsibilityMutationOperationId = Extract<
  AdminOperationId,
  | "admin.organizationResponsibility.createAssignment"
  | "admin.organizationResponsibility.pauseAssignment"
  | "admin.organizationResponsibility.resumeAssignment"
  | "admin.organizationResponsibility.endAssignment"
>;

export const ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS = {
  pause: "admin.organizationResponsibility.pauseAssignment",
  resume: "admin.organizationResponsibility.resumeAssignment",
  end: "admin.organizationResponsibility.endAssignment",
} as const satisfies Record<
  OrganizationResponsibilityAssignmentLifecycleCommand,
  AdminOrganizationResponsibilityMutationOperationId
>;

export interface AdminOrganizationResponsibilityActionFacts {
  status: OrganizationResponsibilityAssignmentStatus;
}

export interface AdminOrganizationResponsibilityMutationDenial {
  operationId: AdminOrganizationResponsibilityMutationOperationId;
  resourceIdentifier: string | number | null;
  reason: AdminAuthorizationReasonCode;
}

export interface FullOrganizationResponsibilityReadScope {
  kind: "full";
}

export interface ScopedOrganizationResponsibilityReadScope {
  kind: "scoped";
  organizationIds: readonly number[];
}

export type OrganizationResponsibilityReadScope
  = | FullOrganizationResponsibilityReadScope
    | ScopedOrganizationResponsibilityReadScope;

interface AdminOrganizationResponsibilityAuthorizationBase {
  readScope: OrganizationResponsibilityReadScope;
  getAllowedActions: (
    facts: AdminOrganizationResponsibilityActionFacts,
  ) => AdminOrganizationResponsibilityAllowedActions;
  denyMutation: (
    input: AdminOrganizationResponsibilityMutationDenial,
  ) => never;
}

export interface FullAdminOrganizationResponsibilityAuthorization
  extends AdminOrganizationResponsibilityAuthorizationBase {
  kind: "full";
  readScope: FullOrganizationResponsibilityReadScope;
}

export interface ScopedAdminOrganizationResponsibilityAuthorization
  extends AdminOrganizationResponsibilityAuthorizationBase {
  kind: "scoped";
  readScope: ScopedOrganizationResponsibilityReadScope;
}

export type AdminOrganizationResponsibilityAuthorization
  = | FullAdminOrganizationResponsibilityAuthorization
    | ScopedAdminOrganizationResponsibilityAuthorization;
