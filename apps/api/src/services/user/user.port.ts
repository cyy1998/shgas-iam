import type { PasswordHasherPort } from "@api/composition/runtime";
import type { ApiRequestContext, AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { MobileVerificationCodeReservation } from "@api/services/mobile/mobile.type";
import type { PrivilegeDelegationDto } from "@api/services/privilege/privilegeDelegation.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type {
  User,
  UserDetailDto,
  UserDto,
  UserQueryDto,
  UserQueryWithPrivilegeDelegationDto,
} from "./user.type";

export interface UserEmploymentReaderPort {
  getEmploymentsByUserId: (userId: number) => Promise<Array<{ id: number }>>;
}

export interface UserRoleReaderPort {
  getRolesByEmploymentId: (employmentId: number) => Promise<Array<{
    id: number;
    roleCode: string;
  }>>;
}

export interface UserPrivilegeReaderPort {
  getPrivilegesByRoleIds: (roleIds: number[]) => Promise<Array<{ privilegeCode: string }>>;
}

export interface UserProfileReaderPort {
  getDetailByUserId: (userId: number) => Promise<UserDetailDto>;
  getDetailByUsername: (username: string) => Promise<UserDetailDto>;
  getDetailByMobile: (mobile: string) => Promise<UserDetailDto>;
  getDetailByWxId: (wxId: string) => Promise<UserDetailDto>;
  searchLegacyUsers: (query: UserQueryDto) => Promise<UserDto[]>;
}

export interface UserDelegationReaderPort {
  getDelegationsByUserAndOrganizationScopeAndPrivilege: (
    usernames: string[],
    orgCode: string,
    privilegeCode: string,
  ) => Promise<unknown[]>;
}

export interface UserMobileBindingPort {
  checkValidPhoneNumber: (phone: string) => boolean;
  checkExistingPhoneNumber: (phone: string) => Promise<boolean>;
  reserveVerificationCode: (
    usage: string,
    phone: string,
    code: string,
  ) => Promise<MobileVerificationCodeReservation | null>;
}

export interface UserMobileVerificationPort {
  confirmReservedVerificationCode: (reservation: MobileVerificationCodeReservation) => Promise<boolean>;
  releaseReservedVerificationCode: (reservation: MobileVerificationCodeReservation) => Promise<void>;
}

export interface UserStorePort {
  getUserById: (userId: number) => Promise<User | null>;
  getUserByUsername: (username: string) => Promise<User | null>;
  getUserByWxId: (wxId: string) => Promise<User | null>;
  getUserByMobile: (mobile: string) => Promise<User | null>;
  updateEnabledUserStatus: (userId: number, status: User["status"]) => Promise<User | null>;
}

export interface UserTransactionStorePort {
  getUserByUsername: (username: string) => Promise<User | null>;
  setPassword: (userId: number, password: string) => Promise<unknown>;
  setMobile: (userId: number, phoneNumber: string) => Promise<unknown>;
  updateEnabledUserStatus: (userId: number, status: User["status"]) => Promise<User | null>;
}

export interface UserDetailBuilderDeps {
  employmentRepository: UserEmploymentReaderPort;
  roleRepository: UserRoleReaderPort;
  privilegeRepository: UserPrivilegeReaderPort;
}

export interface UserDelegationQueryDeps {
  profileQuery: Pick<UserProfileReaderPort, "searchLegacyUsers">;
  privilegeDelegationRepository: UserDelegationReaderPort;
}

export interface UserMobileBindingDeps {
  mobileService: UserMobileBindingPort;
  auditLogWriter: AuditLogWriterPort;
}

export interface UserRequestOptions {
  requestContext?: ApiRequestContext;
}

export interface UserPasswordHelperDeps {
  passwordHasher: PasswordHasherPort;
}

export interface UserSearchWithDelegationsResult {
  users: UserDto[];
  delegations: PrivilegeDelegationDto[];
}

export interface UserTransactionPorts {
  userRepository: UserTransactionStorePort;
  auditLogWriter: AuditLogWriterPort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markUsersDirty">;
}

export type UserUnitOfWorkPort = UnitOfWorkPort<UserTransactionPorts>;

export interface UserServiceDeps {
  userRepository: UserStorePort;
  mobileService: UserMobileVerificationPort;
  profileQuery: UserProfileReaderPort;
  userDelegationQuery: {
    searchUsersWithDelegations: (
      query: UserQueryWithPrivilegeDelegationDto,
    ) => Promise<UserSearchWithDelegationsResult>;
  };
  mobileBinding: {
    assertCanBindMobile: (
      userId: number,
      phoneNumber: string,
      code: string,
      options?: UserRequestOptions,
    ) => Promise<MobileVerificationCodeReservation>;
  };
  passwordHelper: {
    assertStrongPassword: (password: string) => void;
    hashUserPassword: (password: string) => Promise<string>;
    verifyUserPassword: (user: { password: string | null }, inputPassword: string) => Promise<boolean>;
  };
  uow: UserUnitOfWorkPort;
}
