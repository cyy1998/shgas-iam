import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { RoleAssignmentTargetType } from "@iam/contracts";
import type {
  AdminRoleAssignmentCreateRecord,
  AdminRoleAssignmentRecord,
  AdminRoleCreateRecord,
  Role,
  RoleAssignmentDto,
  RoleAssignmentPaginationQueryDto,
  RoleAssignmentTargetSummaryDto,
  RoleClientSummaryDto,
  RoleDetailDto,
  RolePaginationQueryDto,
  RoleUpdateDto,
} from "./role.type";

export interface AdminRoleTransactionStorePort {
  countAssignmentsByRoleId: (roleId: number) => Promise<number>;
  createAssignment: (input: AdminRoleAssignmentCreateRecord) => Promise<AdminRoleAssignmentRecord>;
  createRole: (input: AdminRoleCreateRecord) => Promise<Role>;
  deleteAssignment: (roleId: number, assignmentId: number) => Promise<AdminRoleAssignmentRecord | null>;
  findAssignmentByRoleTarget: (
    roleId: number,
    targetType: RoleAssignmentTargetType,
    targetId: number,
  ) => Promise<unknown | null>;
  getAnyRoleByCode: (roleCode: string) => Promise<Role | null>;
  getAssignmentByIdForRole: (roleId: number, assignmentId: number) => Promise<RoleAssignmentDto | null>;
  getAssignableEmploymentById: (employmentId: number) => Promise<RoleAssignmentTargetSummaryDto | null>;
  getAssignableOrganizationByCode: (orgCode: string) => Promise<RoleAssignmentTargetSummaryDto | null>;
  getAssignablePositionByCode: (posCode: string) => Promise<RoleAssignmentTargetSummaryDto | null>;
  getClientByCode: (clientCode: string) => Promise<RoleClientSummaryDto | null>;
  getRoleByCode: (roleCode: string) => Promise<RoleDetailDto | null>;
  softDeleteRoleByCode: (roleCode: string) => Promise<Role | null>;
  updateAssignmentScope: (
    roleId: number,
    assignmentId: number,
    includeDescendants: boolean,
  ) => Promise<AdminRoleAssignmentRecord | null>;
  updateRoleByCode: (roleCode: string, input: RoleUpdateDto) => Promise<Role | null>;
}

export interface AdminRoleReaderPort {
  getRoleByCode: (roleCode: string) => Promise<RoleDetailDto | null>;
  searchAssignmentsPaged: (
    roleId: number,
    query: RoleAssignmentPaginationQueryDto,
  ) => Promise<{ rows: RoleAssignmentDto[]; total: number }>;
  searchRolesPaged: (
    query: RolePaginationQueryDto,
  ) => Promise<{ rows: RoleDetailDto[]; total: number }>;
}

export interface AdminRoleProfileChange {
  readonly kind: "role";
  readonly roleId: number;
}

export interface AdminRoleAssignmentProfileChange {
  readonly kind: "role-assignment";
  readonly targetType: RoleAssignmentTargetType;
  readonly targetId: number;
}

export interface AdminRoleTransactionPorts {
  roleRepository: AdminRoleTransactionStorePort;
  auditService: AuditLogWriterPort;
  userProfileInvalidation: {
    recordChanges: (
      changes: readonly (AdminRoleProfileChange | AdminRoleAssignmentProfileChange)[],
    ) => Promise<void>;
  };
}

export type AdminRoleUnitOfWorkPort = UnitOfWorkPort<AdminRoleTransactionPorts>;

export interface AdminRoleServiceDeps {
  roleRepository: AdminRoleReaderPort;
  uow: AdminRoleUnitOfWorkPort;
}
