import type { DbClient } from "@iam/db";
import {
  EmploymentStatus,
  UserProfileScopeType,
} from "@iam/contracts";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  positionRoles,
  privileges,
  rolePrivileges,
  users,
} from "@iam/db/schema";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";

export interface ScanAllUserIdsInput {
  afterUserId?: number;
  limit: number;
}

export type UserProfileExpansionScope
  = | { scopeType: UserProfileScopeType.AllUsers }
    | { scopeType: UserProfileScopeType.UserIds; userIds: number[] }
    | { scopeType: UserProfileScopeType.UserId; scopeId: number }
    | { scopeType: UserProfileScopeType.OrganizationId; scopeId: number }
    | { scopeType: UserProfileScopeType.PositionId; scopeId: number }
    | { scopeType: UserProfileScopeType.RoleId; scopeId: number }
    | { scopeType: UserProfileScopeType.PrivilegeId; scopeId: number }
    | { scopeType: UserProfileScopeType.PrivilegeCode; scopeId: string }
    | { scopeType: UserProfileScopeType.EmploymentId; scopeId: number };

export function createUserProfileScopeRepository(db: DbClient) {
  return {
    async scanAllUserIds(input: ScanAllUserIdsInput) {
      return await scanAllUserIds(db, input);
    },

    async resolveUserIds(scope: UserProfileExpansionScope) {
      switch (scope.scopeType) {
        case UserProfileScopeType.AllUsers:
          return await scanAllUserIds(db, { limit: Number.MAX_SAFE_INTEGER });
        case UserProfileScopeType.UserIds:
          return [...new Set(scope.userIds)];
        case UserProfileScopeType.UserId:
          return [scope.scopeId];
        case UserProfileScopeType.OrganizationId:
          return await findUserIdsByOrganizationId(db, scope.scopeId);
        case UserProfileScopeType.PositionId:
          return await findUserIdsByPositionId(db, scope.scopeId);
        case UserProfileScopeType.RoleId:
          return await findUserIdsByRoleIds(db, [scope.scopeId]);
        case UserProfileScopeType.PrivilegeId:
          return await findUserIdsByPrivilegeId(db, scope.scopeId);
        case UserProfileScopeType.PrivilegeCode:
          return await findUserIdsByPrivilegeCode(db, scope.scopeId);
        case UserProfileScopeType.EmploymentId:
          return await findUserIdsByEmploymentId(db, scope.scopeId);
      }
    },
  };
}

export type UserProfileScopeRepository = ReturnType<typeof createUserProfileScopeRepository>;

async function scanAllUserIds(db: DbClient, input: ScanAllUserIdsInput) {
  const rows = await db
    .select({ userId: users.id })
    .from(users)
    .where(input.afterUserId === undefined ? undefined : gt(users.id, input.afterUserId))
    .orderBy(asc(users.id))
    .limit(input.limit);
  return uniqueUserIds(rows);
}

async function findUserIdsByOrganizationId(db: DbClient, organizationId: number) {
  const rows = await db
    .select({ userId: employments.userId })
    .from(organizationClosures)
    .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
    .where(and(
      eq(organizationClosures.ancestorId, organizationId),
      eq(employments.status, EmploymentStatus.Enable),
      eq(employments.isDelete, false),
    ));
  return uniqueUserIds(rows);
}

async function findUserIdsByPositionId(db: DbClient, positionId: number) {
  const rows = await db
    .select({ userId: employments.userId })
    .from(employments)
    .where(and(
      eq(employments.posId, positionId),
      eq(employments.status, EmploymentStatus.Enable),
      eq(employments.isDelete, false),
    ));
  return uniqueUserIds(rows);
}

async function findUserIdsByRoleIds(db: DbClient, roleIds: number[]) {
  if (roleIds.length === 0)
    return [];

  const [employmentRows, positionRows, organizationRows] = await Promise.all([
    db
      .select({ userId: employments.userId })
      .from(employmentRoles)
      .innerJoin(employments, eq(employmentRoles.employmentId, employments.id))
      .where(and(
        inArray(employmentRoles.roleId, roleIds),
        eq(employments.status, EmploymentStatus.Enable),
        eq(employments.isDelete, false),
      )),
    db
      .select({ userId: employments.userId })
      .from(positionRoles)
      .innerJoin(employments, eq(positionRoles.positionId, employments.posId))
      .where(and(
        inArray(positionRoles.roleId, roleIds),
        eq(employments.status, EmploymentStatus.Enable),
        eq(employments.isDelete, false),
      )),
    db
      .select({ userId: employments.userId })
      .from(organizationRoles)
      .innerJoin(organizationClosures, eq(organizationRoles.organizationId, organizationClosures.ancestorId))
      .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
      .where(and(
        inArray(organizationRoles.roleId, roleIds),
        eq(employments.status, EmploymentStatus.Enable),
        eq(employments.isDelete, false),
        or(
          eq(organizationClosures.depth, 0),
          and(gt(organizationClosures.depth, 0), eq(organizationRoles.isAllSub, true)),
        ),
      )),
  ]);

  return uniqueUserIds([...employmentRows, ...positionRows, ...organizationRows]);
}

async function findUserIdsByPrivilegeId(db: DbClient, privilegeId: number) {
  const rows = await db
    .select({ roleId: rolePrivileges.roleId })
    .from(rolePrivileges)
    .where(eq(rolePrivileges.privilegeId, privilegeId));
  return await findUserIdsByRoleIds(db, rows.map(row => row.roleId));
}

async function findUserIdsByPrivilegeCode(db: DbClient, privilegeCode: string) {
  const rows = await db
    .select({ roleId: rolePrivileges.roleId })
    .from(privileges)
    .innerJoin(rolePrivileges, eq(rolePrivileges.privilegeId, privileges.id))
    .where(eq(privileges.privilegeCode, privilegeCode));
  return await findUserIdsByRoleIds(db, rows.map(row => row.roleId));
}

async function findUserIdsByEmploymentId(db: DbClient, employmentId: number) {
  const rows = await db
    .select({ userId: employments.userId })
    .from(employments)
    .where(eq(employments.id, employmentId));
  return uniqueUserIds(rows);
}

function uniqueUserIds(rows: Array<{ userId: number }>) {
  return [...new Set(rows.map(row => row.userId))];
}
