import type { PasswordHasherPort } from "@api/composition/runtime";
import type { ApiRequestContext } from "@api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { MobileVerificationCodeReservation } from "@api/services/mobile/mobile.type";
import type { PublishedUserLoginProfile } from "@iam/domain/user";
import type { SubjectAccessMutationReceipt, SubjectAccessTransitionTarget } from "@iam/subject-access";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type { User } from "./user.type";

export interface ApiUserDocumentChange {
  readonly kind: "user";
  readonly userId: number;
}

export interface UserDocumentReaderPort {
  getLoginProfileByUserId: (userId: number) => Promise<PublishedUserLoginProfile>;
  getMobileByUsername: (username: string) => Promise<string | null>;
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
  setMobile: (userId: number, phoneNumber: string) => Promise<{ id: number } | null>;
  updateEnabledUserStatus: (userId: number, status: User["status"]) => Promise<User | null>;
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
  userDocumentInvalidation: {
    recordChanges: (changes: readonly ApiUserDocumentChange[]) => Promise<void>;
  };
}

export type UserUnitOfWorkPort = UnitOfWorkPort<UserTransactionPorts>;

export interface UserServiceDeps {
  userRepository: UserStorePort;
  mobileService: UserMobileVerificationPort;
  documentQuery: UserDocumentReaderPort;
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
