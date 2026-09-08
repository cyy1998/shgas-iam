import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  AdminEmploymentAuthorizationFacts,
  AdminEmploymentRecordUpdate,
  Employment,
  EmploymentAdminPaginationQueryDto,
  EmploymentDetail,
} from "./employment.type";

export interface AdminEmploymentProfileChange {
  readonly kind: "employment";
  readonly userId: number;
}

export interface AdminEmploymentStorePort {
  lockEmploymentByIdForAdmin: (id: number) => Promise<EmploymentDetail | null>;
  updateEmploymentRecord: (id: number, input: AdminEmploymentRecordUpdate) => Promise<Employment>;
}

export interface AdminEmploymentReadScope {
  organizationIds: readonly number[];
}

export interface AdminEmploymentReaderPort {
  getEmploymentAuthorizationFactsByIdForAdmin: (
    id: number,
  ) => Promise<AdminEmploymentAuthorizationFacts | null>;
  getEmploymentByIdForAdmin: (
    id: number,
    scope?: AdminEmploymentReadScope,
  ) => Promise<EmploymentDetail | null>;
  searchEmploymentsFuzzyForAdminPaged: (
    query: EmploymentAdminPaginationQueryDto,
    scope?: AdminEmploymentReadScope,
  ) => Promise<{
    rows: EmploymentDetail[];
    total: number;
  }>;
}

export interface AdminEmploymentEffectiveRoleResolverPort {
  resolveEffectiveRoles: (input: {
    employmentIds: readonly number[];
  }) => Promise<ReadonlyMap<number, readonly {
    id: number;
    roleCode: string;
  }[]>>;
}

export interface AdminEmploymentPrivilegeReaderPort {
  getPrivilegesByRoleIds: (roleIds: number[]) => Promise<Array<{ privilegeCode: string }>>;
}

export interface AdminEmploymentTransactionPorts {
  employmentRepository: AdminEmploymentStorePort;
  auditService: AuditLogWriterPort;
  userProfileInvalidation: {
    recordChanges: (changes: readonly AdminEmploymentProfileChange[]) => Promise<void>;
  };
}

export type AdminEmploymentUnitOfWorkPort = UnitOfWorkPort<AdminEmploymentTransactionPorts>;

export interface AdminEmploymentServiceDeps {
  employmentRepository: AdminEmploymentReaderPort;
  roleAssignmentResolver: AdminEmploymentEffectiveRoleResolverPort;
  privilegeRepository: AdminEmploymentPrivilegeReaderPort;
  uow: AdminEmploymentUnitOfWorkPort;
}
