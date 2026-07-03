import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { RoleRepository } from "./role.repository";

export interface AdminRoleTransactionPorts {
  roleRepository: Pick<
    RoleRepository,
    | "countAssignmentsByRoleId"
    | "createAssignment"
    | "createRole"
    | "deleteAssignment"
    | "findAssignmentByRoleTarget"
    | "getAnyRoleByCode"
    | "getAssignmentByIdForRole"
    | "getAssignableEmploymentById"
    | "getAssignableOrganizationByCode"
    | "getAssignablePositionByCode"
    | "getClientByCode"
    | "getRoleByCode"
    | "softDeleteRoleByCode"
    | "updateAssignmentScope"
    | "updateRoleByCode"
  >;
  auditService: AuditLogWriterPort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markScopeDirty">;
}

export type AdminRoleUnitOfWorkPort = UnitOfWorkPort<AdminRoleTransactionPorts>;

export interface AdminRoleServiceDeps {
  roleRepository: Pick<RoleRepository, "getRoleByCode" | "searchAssignmentsPaged" | "searchRolesPaged">;
  uow: AdminRoleUnitOfWorkPort;
}
