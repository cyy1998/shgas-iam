import type { PrivilegeQueryDto } from "@api/services/privilege/privilege.type";
import type {
  PrivilegeDelegationConflict,
  PrivilegeDelegationCreateDto,
  PrivilegeDelegationQueryDto,
  PrivilegeDelegationStatusRecord,
  PrivilegeDelegationUpdateDto,
} from "@api/services/privilege/privilegeDelegation.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";

export interface PrivilegeDelegationUserReaderPort {
  getUserByUsername: (username: string) => Promise<{ id: number } | null>;
}

export interface PrivilegeDelegationOrganizationReaderPort {
  getOrganizationByCode: (orgCode: string) => Promise<{ id: number } | null>;
}

export interface PrivilegeDelegationPrivilegeReaderPort {
  searchPrivileges: (query: PrivilegeQueryDto) => Promise<Array<{
    id: number;
    privilegeCode: string;
  }>>;
}

export interface PrivilegeDelegationTransactionStorePort {
  getDelegationById: (id: number) => Promise<PrivilegeDelegationStatusRecord | null>;
  updateDelegation: (id: number, input: PrivilegeDelegationUpdateDto) => Promise<unknown>;
  getActiveDelegationsByDelegatorAndPrivileges: (
    delegatorUserId: number,
    privilegeIds: number[],
    startTime: Date,
    endTime: Date,
  ) => Promise<PrivilegeDelegationConflict[]>;
  setPrivilegeDelegation: (input: PrivilegeDelegationCreateDto) => Promise<unknown>;
}

export interface PrivilegeDelegationSearchPort {
  searchDelegations: (query: PrivilegeDelegationQueryDto) => Promise<unknown[]>;
}

export interface PrivilegeDelegationTransactionPorts {
  userRepository: PrivilegeDelegationUserReaderPort;
  organizationRepository: PrivilegeDelegationOrganizationReaderPort;
  privilegeRepository: PrivilegeDelegationPrivilegeReaderPort;
  privilegeDelegationRepository: PrivilegeDelegationTransactionStorePort;
}

export type PrivilegeDelegationUnitOfWorkPort = UnitOfWorkPort<PrivilegeDelegationTransactionPorts>;

export interface PrivilegeDelegationServiceDeps {
  privilegeDelegationRepository: PrivilegeDelegationSearchPort;
  uow: PrivilegeDelegationUnitOfWorkPort;
}
