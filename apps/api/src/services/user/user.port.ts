import type { PasswordHasherPort } from "@api/composition/runtime";
import type { ApiRequestContext } from "@api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { MobileVerificationCodeReservation } from "@api/services/mobile/mobile.type";
import type { PrivilegeDelegationDto } from "@api/services/privilege/privilegeDelegation.type";
import type { UserProfileSearchPort } from "@api/services/user-profile-search/user-profile-search.port";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  User,
  UserDetailDto,
  UserDto,
} from "./user.type";

export interface ApiUserProfileChange {
  readonly kind: "user";
  readonly userId: number;
}

export interface UserProfileReaderPort {
  getDetailByUserId: (userId: number) => Promise<UserDetailDto>;
  getDetailByUsername: (username: string) => Promise<UserDetailDto>;
  getDetailByMobile: (mobile: string) => Promise<UserDetailDto>;
  getDetailByWxId: (wxId: string) => Promise<UserDetailDto>;
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
  findUserIdentityByUsername: (username: string) => Promise<{ id: number } | null>;
  findUserIdentityBySubjectIdentifier: (subjectIdentifier: string) => Promise<{ id: number } | null>;
  getUserById: (userId: number) => Promise<User | null>;
  getUserBySubjectIdentifier: (subjectIdentifier: string) => Promise<User | null>;
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

export interface UserDelegationQueryDeps {
  userProfileSearch: Pick<UserProfileSearchPort, "searchLegacyUsers">;
  privilegeDelegationRepository: UserDelegationReaderPort;
}

export interface UserMobileBindingDeps {
  mobileService: UserMobileBindingPort;
  auditLogWriter: AuditLogWriterPort;
}

export interface UserRequestOptions {
  requestContext?: ApiRequestContext;
}

export interface ApiSubjectAccessLifecyclePort {
  run: <T>(input: {
    subjectIdentifier: string;
    disposition: "disabled" | "awaiting_publication";
    mutate: (receipt: SubjectAccessMutationReceipt) => Promise<T>;
    revokeSessions?: (
      result: T,
      context: {
        invalidatedSubjectAccessTransitionId: string;
      },
    ) => Promise<unknown>;
    observability?: {
      requestId?: string;
      traceId?: string;
    };
  }) => Promise<T>;
}

export interface ApiUserSessionRevocationPort {
  revokeUserSessions: (input: {
    subjectIdentifier: string;
    reason: "user_disabled";
    onlySubjectAccessTransitionId: string;
  }) => Promise<unknown>;
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
  subjectAccessMutation: {
    runMutation: <T>(
      receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
      resolveTarget: (result: T) => SubjectAccessTransitionTarget,
    ) => Promise<T>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly ApiUserProfileChange[]) => Promise<void>;
  };
}

export type UserUnitOfWorkPort = UnitOfWorkPort<UserTransactionPorts>;

export interface UserServiceDeps {
  userRepository: UserStorePort;
  mobileService: UserMobileVerificationPort;
  profileQuery: Pick<
    UserProfileReaderPort,
    | "getDetailByUserId"
    | "getDetailByUsername"
    | "getDetailByMobile"
    | "getDetailByWxId"
  >;
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
  sessionRevocation: ApiUserSessionRevocationPort;
  subjectAccessLifecycle: ApiSubjectAccessLifecyclePort;
  uow: UserUnitOfWorkPort;
}
