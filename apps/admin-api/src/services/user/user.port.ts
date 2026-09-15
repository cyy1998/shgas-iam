import type { PasswordHasherPort, RandomPort } from "@admin-api/composition/runtime";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnifiedSessionEffectSchema } from "@admin-api/services/session-management/session-management.schema";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { z } from "zod";
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
  getAnyUserByUsername: (username: string) => Promise<User | null>;
  lockUserByUsername: (username: string, includeDeleted?: boolean) => Promise<User | null>;
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  getUserByUsernameIncludingDeletedForAuthorization: (username: string) => Promise<User | null>;
  getOpenEmploymentOrganizationIdsByUserId: (userId: number) => Promise<number[]>;
  setUserForAdmin: (input: UserCreateDto & { subjectIdentifier: string }) => Promise<User | null>;
  updateUserByUsername: (username: string, input: UserUpdateDto) => Promise<User | null>;
  countOpenEmploymentsByUsername: (username: string) => Promise<number>;
  softDeleteUserByUsername: (username: string) => Promise<User | null>;
  setPassword: (userId: number, password: string) => Promise<User | null>;
}

export interface AdminUserReaderPort {
  getAnyUserByUsername: (username: string) => Promise<User | null>;
  getOpenEmploymentOrganizationIdsByUserId: (userId: number) => Promise<number[]>;
  getUserBySubjectIdentifierForPermittedAdmin: (subjectIdentifier: string) => Promise<User | null>;
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  getUserByUsernameIncludingDeletedForAuthorization: (username: string) => Promise<User | null>;
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
  getPrivilegesByRoleIds: (roleIds: number[]) => Promise<Array<{ privilegeCode: string; privilegeName: string }>>;
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
  roleRepository: { getRoleNamesByIds: (ids: number[]) => Promise<Array<{ roleCode: string; roleName: string }>> };
  privilegeRepository: AdminUserPrivilegeReaderPort;
  passwordHasher: Pick<PasswordHasherPort, "hashPassword">;
  random: Pick<RandomPort, "password" | "uuid">;
  sessionRevocation: {
    revokeUserSessions: (input: {
      userId: number;
      subjectIdentifier: string;
      reason: "user_disabled" | "user_deleted" | "admin_revoke";
      exceptPrincipalSessionId?: string;
      onlySubjectAccessTransitionId?: string;
      auditContext?: AdminAuditContext;
    }) => Promise<unknown>;
  };
  resetPasswordSessionEffect?: (input: {
    userId: number;
    subjectIdentifier: string;
    exceptPrincipalSessionId?: string;
    auditContext?: AdminAuditContext;
  }) => Promise<z.infer<typeof UnifiedSessionEffectSchema>>;
  subjectAccessLifecycle: AdminSubjectAccessLifecyclePort;
  uow: AdminUserUnitOfWorkPort;
}
