import type { ClockPort } from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { EmploymentRepository } from "@admin-api/services/employment/employment.repository";
import type { OrganizationRepository } from "@admin-api/services/organization/organization.repository";
import type { PositionRepository } from "@admin-api/services/position/position.repository";
import type { PrivilegeRepository } from "@admin-api/services/privilege/privilege.repository";
import type { RoleRepository } from "@admin-api/services/role/role.repository";
import type { UserRepository } from "@admin-api/services/user/user.repository";

export interface AdminEmploymentTransactionPorts {
  employmentRepository: Pick<
    EmploymentRepository,
    | "getEmploymentByUserOrgPosId"
    | "getEmploymentByIdForAdmin"
    | "createEmploymentRecord"
    | "updateEmploymentRecord"
    | "unsetPrimariesByUserId"
    | "softDeleteEmployment"
    | "endActiveEmploymentsByUserId"
  >;
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode" | "isOrganizationDescendantOf">;
  positionRepository: Pick<PositionRepository, "getPositionByCode">;
  userRepository: Pick<UserRepository, "getUserByUsernameForAdmin" | "updateUserByUsername">;
  auditService: AuditLogWriterPort;
}

export interface AdminEmploymentUnitOfWorkPort {
  transaction: <T>(callback: (tx: AdminEmploymentTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface AdminEmploymentServiceDeps {
  employmentRepository: Pick<
    EmploymentRepository,
    "getEmploymentByIdForAdmin" | "searchEmploymentsFuzzyForAdminPaged"
  >;
  roleRepository: Pick<RoleRepository, "getRolesByEmploymentId">;
  privilegeRepository: Pick<PrivilegeRepository, "getPrivilegesByRoleIds">;
  clock: Pick<ClockPort, "nowDate">;
  uow: AdminEmploymentUnitOfWorkPort;
}
