import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import type { EffectiveRole } from "@iam/role-assignment-resolution";
import { EmploymentStatus, PositionStatus, PrivilegeStatus } from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  privileges,
  rolePrivileges,
  users,
} from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type UserProfileBuildOrgPathRow = Pick<
  Organization,
  "id" | "orgCode" | "orgName" | "orgType" | "level" | "parentId" | "isVirtual" | "isEntity"
> & {
  descendantId: number;
  depth: number;
};

export type UserProfileBuildPosition = typeof positions.$inferSelect;

export interface UserProfileBuildRoleRow {
  employmentId: number;
  roleId: number;
  roleCode: string;
}

export interface UserProfileBuildPrivilegeRow {
  roleId: number;
  privilegeCode: string;
}

export interface UserProfileBuildDataset {
  users: User[];
  employments: Employment[];
  positions: UserProfileBuildPosition[];
  orgPathRows: UserProfileBuildOrgPathRow[];
  roleRows: UserProfileBuildRoleRow[];
  privilegeRows: UserProfileBuildPrivilegeRow[];
}

export interface UserProfileEffectiveRoleResolverPort {
  readonly resolveEffectiveRoles: (input: {
    readonly employmentIds: readonly number[];
  }) => Promise<ReadonlyMap<number, readonly EffectiveRole[]>>;
}

export function createUserProfileBuildRepository(
  db: DbClient,
  roleAssignmentResolver: UserProfileEffectiveRoleResolverPort,
) {
  return {
    async loadByUserIds(userIds: number[]): Promise<UserProfileBuildDataset> {
      const uniqueUserIds = [...new Set(userIds)];
      if (uniqueUserIds.length === 0)
        return emptyDataset();

      const [userRows, employmentRows] = await Promise.all([
        db.select().from(users).where(inArray(users.id, uniqueUserIds)),
        db.select().from(employments).where(and(
          inArray(employments.userId, uniqueUserIds),
          eq(employments.status, EmploymentStatus.Enable),
          eq(employments.isDelete, false),
        )),
      ]);

      const positionIds = [...new Set(employmentRows.map(row => row.posId))];
      const organizationIds = [...new Set(employmentRows.map(row => row.orgId))];
      const employmentIds = employmentRows.map(row => row.id);

      const [positionRows, orgPathRows, roleRows] = await Promise.all([
        loadActivePositions(db, positionIds),
        loadOrganizationPaths(db, organizationIds),
        loadEmploymentRoles(roleAssignmentResolver, employmentIds),
      ]);
      const roleIds = [...new Set(roleRows.map(row => row.roleId))];
      const privilegeRows = await loadRolePrivileges(db, roleIds);

      return {
        users: userRows,
        employments: employmentRows,
        positions: positionRows,
        orgPathRows,
        roleRows,
        privilegeRows,
      };
    },
  };
}

export type UserProfileBuildRepository = ReturnType<typeof createUserProfileBuildRepository>;

function emptyDataset(): UserProfileBuildDataset {
  return {
    users: [],
    employments: [],
    positions: [],
    orgPathRows: [],
    roleRows: [],
    privilegeRows: [],
  };
}

async function loadActivePositions(db: DbClient, positionIds: number[]) {
  if (positionIds.length === 0)
    return [];

  return await db.select().from(positions).where(and(
    inArray(positions.id, positionIds),
    eq(positions.status, PositionStatus.Enable),
    eq(positions.isDelete, false),
  ));
}

async function loadOrganizationPaths(db: DbClient, organizationIds: number[]) {
  if (organizationIds.length === 0)
    return [];

  const ancestor = alias(organizations, "user_profile_org_ancestor");
  return await db
    .select({
      descendantId: organizationClosures.descendantId,
      depth: organizationClosures.depth,
      id: ancestor.id,
      orgCode: ancestor.orgCode,
      orgName: ancestor.orgName,
      orgType: ancestor.orgType,
      level: ancestor.level,
      parentId: ancestor.parentId,
      isVirtual: ancestor.isVirtual,
      isEntity: ancestor.isEntity,
    })
    .from(organizationClosures)
    .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
    .where(and(
      inArray(organizationClosures.descendantId, organizationIds),
      eq(ancestor.isDelete, false),
    ));
}

async function loadEmploymentRoles(
  roleAssignmentResolver: UserProfileEffectiveRoleResolverPort,
  employmentIds: number[],
): Promise<UserProfileBuildRoleRow[]> {
  if (employmentIds.length === 0)
    return [];

  const effectiveRolesByEmploymentId = await roleAssignmentResolver.resolveEffectiveRoles({ employmentIds });
  return employmentIds.flatMap(employmentId =>
    (effectiveRolesByEmploymentId.get(employmentId) ?? []).map(role => ({
      employmentId,
      roleId: role.id,
      roleCode: role.roleCode,
    })),
  );
}

async function loadRolePrivileges(db: DbClient, roleIds: number[]) {
  if (roleIds.length === 0)
    return [];

  return await db
    .select({
      roleId: rolePrivileges.roleId,
      privilegeCode: privileges.privilegeCode,
    })
    .from(rolePrivileges)
    .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
    .where(and(
      inArray(rolePrivileges.roleId, roleIds),
      eq(privileges.status, PrivilegeStatus.Enable),
      eq(privileges.isDelete, false),
    ));
}
