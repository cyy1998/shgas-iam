import type { PasswordHasherPort, RandomPort } from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  User,
  UserCreateDto,
  UserPaginationQueryDto,
  UserUpdateDto,
} from "./user.type";

export interface AdminUserProfileChange {
  readonly kind: "user";
  readonly userId: number;
}

export interface AdminUserTransactionStorePort {
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  setUserForAdmin: (input: UserCreateDto & { subjectIdentifier: string }) => Promise<User>;
  updateUserByUsername: (username: string, input: UserUpdateDto) => Promise<User>;
  countActiveEmploymentsByUsername: (username: string) => Promise<number>;
  softDeleteUserByUsername: (username: string) => Promise<User>;
  setPassword: (userId: number, password: string) => Promise<User>;
}

export interface AdminUserReaderPort {
  getUserBySubjectIdentifierForAdmin: (subjectIdentifier: string) => Promise<User | null>;
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  searchUsersFuzzyPaged: (query: UserPaginationQueryDto) => Promise<{
    rows: User[];
    total: number;
  }>;
}

export interface AdminUserEmploymentReaderPort {
  getAllEmploymentsByUserIdForAdmin: (userId: number) => Promise<Array<{ id: number }>>;
}

export interface AdminUserEffectiveRoleResolverPort {
  resolveEffectiveRoles: (input: {
    employmentIds: readonly number[];
  }) => Promise<ReadonlyMap<number, readonly {
    id: number;
    roleCode: string;
  }[]>>;
}

export interface AdminUserPrivilegeReaderPort {
  getPrivilegesByRoleIds: (roleIds: number[]) => Promise<Array<{ privilegeCode: string }>>;
}

export interface AdminUserTransactionPorts {
  userRepository: AdminUserTransactionStorePort;
  auditService: AuditLogWriterPort;
  subjectAccessMutation: {
    runMutation: <T>(
      receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
      resolveTarget: (result: T) => SubjectAccessTransitionTarget,
    ) => Promise<T>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly AdminUserProfileChange[]) => Promise<void>;
  };
}

export type AdminUserUnitOfWorkPort = UnitOfWorkPort<AdminUserTransactionPorts>;

export interface AdminSubjectAccessLifecyclePort {
  run: <T>(input: {
    subjectIdentifier: string;
    disposition:
      | "disabled"
      | "awaiting_publication"
      | "restore_previous"
      | ((result: T) => "disabled" | "awaiting_publication" | "restore_previous");
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

export interface AdminUserServiceDeps {
  userRepository: AdminUserReaderPort;
  employmentRepository: AdminUserEmploymentReaderPort;
  roleAssignmentResolver: AdminUserEffectiveRoleResolverPort;
  privilegeRepository: AdminUserPrivilegeReaderPort;
  passwordHasher: Pick<PasswordHasherPort, "hashPassword">;
  random: Pick<RandomPort, "password" | "uuid">;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeUserSessions">;
  subjectAccessLifecycle: AdminSubjectAccessLifecyclePort;
  uow: AdminUserUnitOfWorkPort;
}
