import type { PasswordHasherPort } from "@api/composition/runtime";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { EmploymentRepository } from "@api/services/employment/employment.repository";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { PrivilegeRepository } from "@api/services/privilege/privilege.repository";
import type { PrivilegeDelegationRepository } from "@api/services/privilege/privilegeDelegation.repository";
import type { RoleRepository } from "@api/services/role/role.repository";
import type { UserRepository } from "@api/services/user/user.repository";
import type { User } from "@iam/db/schema";
import type { UserDetailDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";

export interface UserDetailBuilderDeps {
  employmentRepository: Pick<EmploymentRepository, "getEmploymentsByUserId">;
  roleRepository: Pick<RoleRepository, "getRolesByEmploymentId">;
  privilegeRepository: Pick<PrivilegeRepository, "getPrivilegesByRoleIds">;
}

export interface UserDelegationQueryDeps {
  userRepository: Pick<UserRepository, "searchUsers">;
  privilegeDelegationRepository: Pick<PrivilegeDelegationRepository, "getDelegationsByUserAndOrganizationScopeAndPrivilege">;
}

export interface UserMobileBindingDeps {
  mobileService: Pick<MobileService, "checkValidPhoneNumber" | "checkExistingPhoneNumber" | "consumeVerificationCode">;
  auditLogWriter: AuditLogWriterPort;
}

export interface UserPasswordHelperDeps {
  passwordHasher: PasswordHasherPort;
}

export interface UserTransactionPorts {
  userRepository: Pick<UserRepository, "getUserByUsername" | "setPassword" | "setMobile">;
  auditLogWriter: AuditLogWriterPort;
}

export interface UserUnitOfWorkPort {
  transaction: <T>(callback: (tx: UserTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface UserServiceDeps {
  userRepository: Pick<
    UserRepository,
    | "getUserById"
    | "getUserByUsername"
    | "getUserByWxId"
    | "getUserByMobile"
    | "searchUsers"
    | "updateEnabledUserStatus"
  >;
  mobileService: Pick<MobileService, "consumeVerificationCode" | "checkValidPhoneNumber" | "checkExistingPhoneNumber">;
  auditLogWriter: AuditLogWriterPort;
  userDetailBuilder: {
    buildUserDetail: (user: User | null) => Promise<UserDetailDto>;
  };
  userDelegationQuery: {
    searchUsersWithDelegations: (query: UserQueryWithPrivilegeDelegationDto) => Promise<unknown>;
  };
  mobileBinding: {
    assertCanBindMobile: (userId: number, phoneNumber: string, code: string) => Promise<void>;
  };
  passwordHelper: {
    assertStrongPassword: (password: string) => void;
    hashUserPassword: (password: string) => Promise<string>;
    verifyUserPassword: (user: { password: string | null }, inputPassword: string) => Promise<boolean>;
  };
  uow: UserUnitOfWorkPort;
}
