import type { OrganizationRepository } from "@api/services/organization/organization.repository";
import type { PrivilegeRepository } from "@api/services/privilege/privilege.repository";
import type { PrivilegeDelegationRepository } from "@api/services/privilege/privilegeDelegation.repository";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UnitOfWorkPort } from "@iam/api-core/uow";

export interface PrivilegeDelegationTransactionPorts {
  userRepository: Pick<UserRepository, "getUserByUsername">;
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode">;
  privilegeRepository: Pick<PrivilegeRepository, "searchPrivileges">;
  privilegeDelegationRepository: Pick<
    PrivilegeDelegationRepository,
    | "getDelegationById"
    | "updateDelegation"
    | "getActiveDelegationsByDelegatorAndPrivileges"
    | "setPrivilegeDelegation"
  >;
}

export type PrivilegeDelegationUnitOfWorkPort = UnitOfWorkPort<PrivilegeDelegationTransactionPorts>;

export interface PrivilegeDelegationServiceDeps {
  privilegeDelegationRepository: Pick<PrivilegeDelegationRepository, "searchDelegations">;
  uow: PrivilegeDelegationUnitOfWorkPort;
}
