import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { PrivilegeQueryDto } from "@api/services/privilege/privilege.type";
import type {
  PrivilegeDelegationInsert,
  PrivilegeDelegationQueryDto,
  PrivilegeDelegationRecord,
  PrivilegeDelegationUpdateDto,
} from "@api/services/privilege/privilegeDelegation.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";

export interface PrivilegeDelegationUserReaderPort {
  getUserByUsername: (username: string) => Promise<{ id: number } | null>;
  lockUserByUsername: (username: string) => Promise<{ id: number } | null>;
  lockUserById: (id: number) => Promise<{ id: number } | null>;
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
  getDelegatorUserId: (id: number) => Promise<number | null>;
  lockDelegationById: (id: number) => Promise<PrivilegeDelegationRecord | null>;
  updateDelegation: (id: number, input: PrivilegeDelegationUpdateDto) => Promise<{ id: number } | null>;
  hasConflictingDelegation: (
    delegatorUserId: number,
    privilegeIds: number[],
    startTime: Date,
    endTime: Date,
    organizationScopeId: number,
    excludeId?: number,
  ) => Promise<boolean>;
  setPrivilegeDelegation: (input: PrivilegeDelegationInsert) => Promise<unknown>;
}

export interface PrivilegeDelegationSearchPort {
  searchDelegations: (query: PrivilegeDelegationQueryDto) => Promise<unknown[]>;
}

export interface PrivilegeDelegationTransactionPorts {
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
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
