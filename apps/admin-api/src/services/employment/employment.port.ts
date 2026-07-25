import type { ClockPort } from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { Organization } from "@iam/domain/organization";
import type { Position } from "@iam/domain/position";
import type { User } from "@iam/domain/user";
import type {
  AdminEmploymentRecordCreate,
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
  getEmploymentByUserOrgPosId: (
    userId: number,
    orgId: number,
    posId: number,
  ) => Promise<EmploymentDetail | null>;
  getEmploymentByIdForAdmin: (id: number) => Promise<EmploymentDetail | null>;
  createEmploymentRecord: (input: AdminEmploymentRecordCreate) => Promise<Employment>;
  updateEmploymentRecord: (id: number, input: AdminEmploymentRecordUpdate) => Promise<Employment>;
  unsetPrimariesByUserId: (userId: number, exceptEmploymentId: number | null) => Promise<unknown>;
  softDeleteEmployment: (id: number) => Promise<unknown>;
}

export interface AdminEmploymentReaderPort {
  getEmploymentByIdForAdmin: (id: number) => Promise<EmploymentDetail | null>;
  searchEmploymentsFuzzyForAdminPaged: (query: EmploymentAdminPaginationQueryDto) => Promise<{
    rows: EmploymentDetail[];
    total: number;
  }>;
}

export interface AdminEmploymentOrganizationReaderPort {
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  isOrganizationDescendantOf: (descendantOrgCode: string, ancestorOrgCode: string) => Promise<boolean>;
}

export interface AdminEmploymentPositionReaderPort {
  getPositionByCode: (posCode: string) => Promise<Position | null>;
}

export interface AdminEmploymentUserReaderPort {
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
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
  organizationRepository: AdminEmploymentOrganizationReaderPort;
  positionRepository: AdminEmploymentPositionReaderPort;
  userRepository: AdminEmploymentUserReaderPort;
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
  clock: Pick<ClockPort, "nowDate">;
  uow: AdminEmploymentUnitOfWorkPort;
}
