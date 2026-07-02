import type { PasswordHasherPort } from "@api/composition/runtime";
import type { ApiRequestContext, AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { EmploymentRepository } from "@api/services/employment/employment.repository";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { PrivilegeRepository } from "@api/services/privilege/privilege.repository";
import type { PrivilegeDelegationRepository } from "@api/services/privilege/privilegeDelegation.repository";
import type { RoleRepository } from "@api/services/role/role.repository";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { UserProfileQueryService } from "@iam/user-profile-read-model/query";
import type { UserQueryWithPrivilegeDelegationDto } from "./user.type";

export interface UserDetailBuilderDeps {
  employmentRepository: Pick<EmploymentRepository, "getEmploymentsByUserId">;
  roleRepository: Pick<RoleRepository, "getRolesByEmploymentId">;
  privilegeRepository: Pick<PrivilegeRepository, "getPrivilegesByRoleIds">;
}

export interface UserDelegationQueryDeps {
  profileQuery: Pick<UserProfileQueryService, "searchLegacyUsers">;
  privilegeDelegationRepository: Pick<PrivilegeDelegationRepository, "getDelegationsByUserAndOrganizationScopeAndPrivilege">;
}

export interface UserMobileBindingDeps {
  mobileService: Pick<MobileService, "checkValidPhoneNumber" | "checkExistingPhoneNumber" | "consumeVerificationCode">;
  auditLogWriter: AuditLogWriterPort;
}

export interface UserRequestOptions {
  requestContext?: ApiRequestContext;
}

export interface UserPasswordHelperDeps {
  passwordHasher: PasswordHasherPort;
}

export interface UserTransactionPorts {
  userRepository: Pick<
    UserRepository,
    "getUserByUsername" | "setPassword" | "setMobile" | "updateEnabledUserStatus"
  >;
  auditLogWriter: AuditLogWriterPort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markUsersDirty">;
}

export type UserUnitOfWorkPort = UnitOfWorkPort<UserTransactionPorts>;

export interface UserServiceDeps {
  userRepository: Pick<
    UserRepository,
    | "getUserById"
    | "getUserByUsername"
    | "getUserByWxId"
    | "getUserByMobile"
    | "updateEnabledUserStatus"
  >;
  mobileService: Pick<MobileService, "consumeVerificationCode" | "checkValidPhoneNumber" | "checkExistingPhoneNumber">;
  auditLogWriter: AuditLogWriterPort;
  profileQuery: Pick<
    UserProfileQueryService,
    | "getDetailByUserId"
    | "getDetailByUsername"
    | "getDetailByMobile"
    | "getDetailByWxId"
    | "searchLegacyUsers"
  >;
  userDelegationQuery: {
    searchUsersWithDelegations: (query: UserQueryWithPrivilegeDelegationDto) => Promise<unknown>;
  };
  mobileBinding: {
    assertCanBindMobile: (
      userId: number,
      phoneNumber: string,
      code: string,
      options?: UserRequestOptions,
    ) => Promise<void>;
  };
  passwordHelper: {
    assertStrongPassword: (password: string) => void;
    hashUserPassword: (password: string) => Promise<string>;
    verifyUserPassword: (user: { password: string | null }, inputPassword: string) => Promise<boolean>;
  };
  uow: UserUnitOfWorkPort;
}
