import type { PasswordHasherPort, RandomPort } from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { EmploymentRepository } from "@admin-api/services/employment/employment.repository";
import type { PrivilegeRepository } from "@admin-api/services/privilege/privilege.repository";
import type { RoleRepository } from "@admin-api/services/role/role.repository";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserRepository } from "./user.repository";

export interface AdminUserTransactionPorts {
  userRepository: Pick<
    UserRepository,
    | "getUserByUsernameForAdmin"
    | "setUserForAdmin"
    | "updateUserByUsername"
    | "countActiveEmploymentsByUsername"
    | "softDeleteUserByUsername"
    | "setPassword"
  >;
  auditService: AuditLogWriterPort;
}

export type AdminUserUnitOfWorkPort = UnitOfWorkPort<AdminUserTransactionPorts>;

export interface AdminUserServiceDeps {
  userRepository: Pick<UserRepository, "getUserByUsernameForAdmin" | "searchUsersFuzzyPaged">;
  employmentRepository: Pick<EmploymentRepository, "getAllEmploymentsByUserIdForAdmin">;
  roleRepository: Pick<RoleRepository, "getRolesByEmploymentId">;
  privilegeRepository: Pick<PrivilegeRepository, "getPrivilegesByRoleIds">;
  passwordHasher: Pick<PasswordHasherPort, "hashPassword">;
  random: Pick<RandomPort, "password">;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeUserSessions">;
  uow: AdminUserUnitOfWorkPort;
}
