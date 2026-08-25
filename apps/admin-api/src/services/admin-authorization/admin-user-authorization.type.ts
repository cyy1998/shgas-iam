import type {
  AdminAuthorizationReasonCode,
  AdminUserAllowedActions,
  UserStatus,
} from "@iam/contracts";
import type { AdminOperationId } from "./admin-operation.registry";

export interface AdminUserActionFacts {
  status: UserStatus;
  isDelete: boolean;
  openEmploymentOrganizationIds: readonly number[];
  endedEmploymentOrganizationIds: readonly number[];
}

export interface AdminUserMutationDenial {
  operationId: AdminOperationId;
  resourceIdentifier: string;
  reason: AdminAuthorizationReasonCode;
}

interface AdminUserAuthorizationBase {
  getAllowedActions: (facts: AdminUserActionFacts) => AdminUserAllowedActions;
  denyMutation: (input: AdminUserMutationDenial) => never;
}

export interface FullAdminUserAuthorization extends AdminUserAuthorizationBase {
  kind: "full";
  organizationIds: null;
}

export interface ScopedAdminUserAuthorization extends AdminUserAuthorizationBase {
  kind: "scoped";
  organizationIds: readonly number[];
}

export type AdminUserAuthorization
  = | FullAdminUserAuthorization
    | ScopedAdminUserAuthorization;
