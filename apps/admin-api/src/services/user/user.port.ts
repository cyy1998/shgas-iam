import type { PasswordHasherPort, RandomPort } from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type {
  User,
  UserCreateDto,
  UserPaginationQueryDto,
  UserUpdateDto,
} from "./user.type";

export interface AdminUserTransactionStorePort {
  getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  setUserForAdmin: (input: UserCreateDto) => Promise<User>;
  updateUserByUsername: (username: string, input: UserUpdateDto) => Promise<User>;
  countActiveEmploymentsByUsername: (username: string) => Promise<number>;
  softDeleteUserByUsername: (username: string) => Promise<User>;
  setPassword: (userId: number, password: string) => Promise<User>;
}

export interface AdminUserReaderPort {
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
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markUsersDirty">;
}

export type AdminUserUnitOfWorkPort = UnitOfWorkPort<AdminUserTransactionPorts>;

export interface AdminUserServiceDeps {
  userRepository: AdminUserReaderPort;
  employmentRepository: AdminUserEmploymentReaderPort;
  roleAssignmentResolver: AdminUserEffectiveRoleResolverPort;
  privilegeRepository: AdminUserPrivilegeReaderPort;
  passwordHasher: Pick<PasswordHasherPort, "hashPassword">;
  random: Pick<RandomPort, "password">;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeUserSessions">;
  uow: AdminUserUnitOfWorkPort;
}
