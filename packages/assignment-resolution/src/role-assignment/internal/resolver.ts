import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { employments, organizationClosures, organizations, positions, roleInclusions, roles } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { and, eq, gt, inArray, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { EffectiveRole, RoleAssignmentResolver } from "../index.ts";

type EmploymentRoleRow = { employmentId: number; id: number; roleCode: string };

const assignmentOrganization = alias(organizations, "role_resolution_assignment_organization");

export function createResolver(db: DbClient): RoleAssignmentResolver {
  return {
    async resolveEffectiveRoles(input) {
      const employmentIds = unique(input.employmentIds);
      const result = new Map<number, EffectiveRole[]>(employmentIds.map((id) => [id, []]));
      if (employmentIds.length === 0) return result;

      const rows = await loadEffectiveRoles(db, employmentIds, input.clientId);
      for (const { employmentId, id, roleCode } of rows) {
        result.get(employmentId)?.push({ id, roleCode });
      }
      for (const roles of result.values()) roles.sort(compareEffectiveRoles);
      return result;
    },
    async resolveAffectedUserIds(input) {
      const roleIds = unique(input.roleIds);
      if (roleIds.length === 0) return [];

      const rows = await loadAffectedUsers(db, roleIds);
      return rows.map(({ userId }) => userId);
    },
  };
}

// Reverse impact includes inactive Roles and assignment targets so a status change
// still reaches users who may hold the old published grant.
async function loadAffectedUsers(db: DbClient, roleIds: number[]) {
  const affectedRoleIds = sql`(select role_id from affected_roles)`;
  return await db.execute<{ userId: number }>(sql`
    with recursive affected_roles(role_id) as (
      select unnest(${sql.param(roleIds)}::integer[])
      union
      select ${roleInclusions.containerRoleId}
      from affected_roles
      join ${roleInclusions} on ${roleInclusions.memberRoleId} = affected_roles.role_id
    )
    select user_id as "userId"
    from (
      ${selectUsersAffectedByEmploymentAssignments(db, affectedRoleIds)}
      union
      ${selectUsersAffectedByPositionAssignments(db, affectedRoleIds)}
      union
      ${selectUsersAffectedByOrganizationAssignments(db, affectedRoleIds)}
    ) as affected_users(user_id)
    order by user_id
  `);
}

function selectUsersAffectedByEmploymentAssignments(db: DbClient, roleIds: SQL) {
  return db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(employments, eq(employments.id, roleAssignments.targetId))
    .where(
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
        inArray(roleAssignments.roleId, roleIds),
        activeEmploymentWhere(),
      ),
    );
}

function selectUsersAffectedByPositionAssignments(db: DbClient, roleIds: SQL) {
  return db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(employments, eq(employments.posId, roleAssignments.targetId))
    .where(
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
        inArray(roleAssignments.roleId, roleIds),
        activeEmploymentWhere(),
      ),
    );
}

function selectUsersAffectedByOrganizationAssignments(db: DbClient, roleIds: SQL) {
  return db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(organizationClosures, eq(organizationClosures.ancestorId, roleAssignments.targetId))
    .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
    .where(
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
        inArray(roleAssignments.roleId, roleIds),
        activeEmploymentWhere(),
        or(
          eq(organizationClosures.depth, 0),
          and(gt(organizationClosures.depth, 0), eq(roleAssignments.includeDescendants, true)),
        ),
      ),
    );
}

function activeEmploymentWhere() {
  return and(eq(employments.status, EmploymentStatus.Enable), eq(employments.isDelete, false));
}

// Read the assignments and the graph in one statement snapshot. UNION deduplicates by
// employment and role at each recursive step, including where different assignment sources meet.
async function loadEffectiveRoles(db: DbClient, employmentIds: number[], clientId?: number) {
  return await db.execute<EmploymentRoleRow>(sql`
    with recursive effective(employment_id, role_id) as (
      (
        ${selectEmploymentAssignmentRoles(db, employmentIds)}
        union
        ${selectPositionAssignmentRoles(db, employmentIds)}
        union
        ${selectOrganizationAssignmentRoles(db, employmentIds)}
      )
      union
      select effective.employment_id, ${roleInclusions.memberRoleId}
      from effective
      join ${roleInclusions} on ${roleInclusions.containerRoleId} = effective.role_id
      join ${roles} on ${roles.id} = ${roleInclusions.memberRoleId} and ${activeRoleWhere()}
    )
    select effective.employment_id as "employmentId", ${roles.id}, ${roles.roleCode} as "roleCode"
    from effective
    join ${roles} on ${roles.id} = effective.role_id
    ${clientId === undefined ? sql.empty() : sql`where ${eq(roles.clientId, clientId)}`}
  `);
}

function selectEmploymentAssignmentRoles(db: DbClient, employmentIds: number[]) {
  return db
    .select(rootRoleSelection())
    .from(employments)
    .innerJoin(
      roleAssignments,
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
        eq(roleAssignments.targetId, employments.id),
      ),
    )
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(inArray(employments.id, employmentIds), activeEmploymentWhere(), activeRoleWhere()));
}

function selectPositionAssignmentRoles(db: DbClient, employmentIds: number[]) {
  return db
    .select(rootRoleSelection())
    .from(employments)
    .innerJoin(
      roleAssignments,
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
        eq(roleAssignments.targetId, employments.posId),
      ),
    )
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(
      and(
        inArray(employments.id, employmentIds),
        activeEmploymentWhere(),
        activePositionAssignmentTargetWhere(),
        activeRoleWhere(),
      ),
    );
}

function selectOrganizationAssignmentRoles(db: DbClient, employmentIds: number[]) {
  return db
    .select(rootRoleSelection())
    .from(employments)
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(organizationClosures, eq(organizationClosures.descendantId, employments.orgId))
    .innerJoin(
      roleAssignments,
      and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
        eq(roleAssignments.targetId, organizationClosures.ancestorId),
      ),
    )
    .innerJoin(assignmentOrganization, eq(assignmentOrganization.id, roleAssignments.targetId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(
      and(
        inArray(employments.id, employmentIds),
        activeEmploymentWhere(),
        eq(assignmentOrganization.status, OrganizationStatus.Enable),
        eq(assignmentOrganization.isDelete, false),
        activeRoleWhere(),
        or(
          eq(organizationClosures.depth, 0),
          and(gt(organizationClosures.depth, 0), eq(roleAssignments.includeDescendants, true)),
        ),
      ),
    );
}

function activeRoleWhere() {
  return and(eq(roles.status, RoleStatus.Enable), eq(roles.isDelete, false));
}

function activePositionAssignmentTargetWhere() {
  return and(eq(positions.status, PositionStatus.Enable), eq(positions.isDelete, false));
}

function rootRoleSelection() {
  return { employmentId: employments.id, roleId: roles.id };
}

function compareEffectiveRoles(left: EffectiveRole, right: EffectiveRole) {
  if (left.roleCode < right.roleCode) return -1;
  if (left.roleCode > right.roleCode) return 1;
  return left.id - right.id;
}

function unique(values: readonly number[]) {
  return [...new Set(values)];
}
