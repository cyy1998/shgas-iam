import type {
  AdminAuthorizationReasonCode,
  AdminEmploymentAllowedActions,
  EmploymentStatus,
  UserStatus,
} from "@iam/contracts";
import type { AdminOperationId } from "./admin-operation.registry";

export interface AdminEmploymentActionFacts {
  status: EmploymentStatus;
  userStatus: UserStatus;
  isPrimary: boolean;
}

export interface AdminEmploymentMutationDenial {
  operationId: AdminOperationId;
  resourceIdentifier: string | number;
  reason: AdminAuthorizationReasonCode;
  concealExistence?: boolean;
}

interface AdminEmploymentAuthorizationBase {
  getAllowedActions: (
    facts: AdminEmploymentActionFacts,
  ) => AdminEmploymentAllowedActions;
  denyMutation: (input: AdminEmploymentMutationDenial) => never;
}

export interface FullAdminEmploymentAuthorization
  extends AdminEmploymentAuthorizationBase {
  kind: "full";
  rootOrganizationIds: null;
  organizationIds: null;
}

export interface ScopedAdminEmploymentAuthorization
  extends AdminEmploymentAuthorizationBase {
  kind: "scoped";
  rootOrganizationIds: readonly number[];
  organizationIds: readonly number[];
}

export type AdminEmploymentAuthorization
  = | FullAdminEmploymentAuthorization
    | ScopedAdminEmploymentAuthorization;
