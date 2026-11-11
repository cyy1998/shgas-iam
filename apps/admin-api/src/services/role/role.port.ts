import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { RoleAssignmentTargetType } from "@iam/contracts";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
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
  RoleInclusionEndpointDto,
  RoleInclusionPatch,
  RolePaginationQueryDto,
  RoleProfileUpdateDto,
} from "./role.type";

export interface AdminRoleTransactionStorePort {
  countAssignmentsByRoleId: (roleId: number) => Promise<number>;
  createAssignment: (input: AdminRoleAssignmentCreateRecord) => Promise<AdminRoleAssignmentRecord | null>;
  createRole: (input: AdminRoleCreateRecord) => Promise<Role | null>;
  deleteAssignment: (roleId: number, assignmentId: number) => Promise<AdminRoleAssignmentRecord | null>;
  lockAssignmentByIdForRole: (roleId: number, assignmentId: number) => Promise<RoleAssignmentDto | null>;
  getAssignableEmploymentById: (employmentId: number) => Promise<RoleAssignmentTargetSummaryDto | null>;
  getAssignableOrganizationByCode: (orgCode: string) => Promise<RoleAssignmentTargetSummaryDto | null>;
  getAssignablePositionByCode: (posCode: string) => Promise<RoleAssignmentTargetSummaryDto | null>;
  lockClientForRoleCreation: (clientCode: string) => Promise<RoleClientSummaryDto | null>;
  lockRoleByCode: (roleCode: string, strength?: "update" | "key share") => Promise<RoleDetailDto | null>;
  getRoleByCode: (roleCode: string) => Promise<RoleDetailDto | null>;
  lockRoleInclusionGraph: () => Promise<void>;
  deleteRoleInclusions: (roleId: number) => Promise<{ containerRoleId: number; memberRoleId: number }[]>;
  getUndeletedRoleIds: (ids: number[]) => Promise<number[]>;
  wouldCreateRoleInclusionCycle: (containerRoleId: number, memberRoleIds: number[]) => Promise<boolean>;
  applyRoleInclusionPatch: (containerRoleId: number, patch: RoleInclusionPatch) => Promise<RoleInclusionPatch>;
  softDeleteRoleByCode: (roleCode: string) => Promise<Role | null>;
  updateAssignmentScope: (
    roleId: number,
    assignmentId: number,
    includeDescendants: boolean,
  ) => Promise<AdminRoleAssignmentRecord | null>;
  updateRoleByCode: (roleCode: string, input: RoleProfileUpdateDto) => Promise<Role | null>;
}

export interface AdminRoleReaderPort {
  getRoleInclusions: (
    roleId: number,
  ) => Promise<{ members: RoleInclusionEndpointDto[]; containers: RoleInclusionEndpointDto[] }>;
  getRoleByCode: (roleCode: string) => Promise<RoleDetailDto | null>;
  searchAssignmentsPaged: (
    roleId: number,
    query: RoleAssignmentPaginationQueryDto,
  ) => Promise<{ rows: RoleAssignmentDto[]; total: number }>;
  searchRolesPaged: (query: RolePaginationQueryDto) => Promise<{ rows: RoleDetailDto[]; total: number }>;
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
  userDocumentInvalidation: {
    recordChanges: (changes: readonly (AdminRoleProfileChange | AdminRoleAssignmentProfileChange)[]) => Promise<void>;
  };
}

export type AdminRoleUnitOfWorkPort = UnitOfWorkPort<AdminRoleTransactionPorts>;

export interface AdminRoleServiceDeps {
  roleRepository: AdminRoleReaderPort;
  uow: AdminRoleUnitOfWorkPort;
}
