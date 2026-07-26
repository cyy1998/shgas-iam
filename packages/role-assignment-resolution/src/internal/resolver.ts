import type { DbClient } from "@iam/db";
import type {
  EffectiveRole,
  RoleAssignmentResolver,
} from "../index.ts";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

interface EmploymentRoleRow extends EffectiveRole {
  employmentId: number;
}

const assignmentOrganization = alias(organizations, "role_resolution_assignment_organization");

export function createResolver(db: DbClient): RoleAssignmentResolver {
  return {
    async resolveEffectiveRoles(input) {
      const employmentIds = unique(input.employmentIds);
      const result = new Map<number, EffectiveRole[]>(employmentIds.map(id => [id, []]));
      if (employmentIds.length === 0)
        return result;

      const [employmentRows, positionRows, organizationRows] = await Promise.all([
        loadEmploymentAssignmentRoles(db, employmentIds, input.clientId),
        loadPositionAssignmentRoles(db, employmentIds, input.clientId),
        loadOrganizationAssignmentRoles(db, employmentIds, input.clientId),
      ]);
      mergeRoleRows(result, [...employmentRows, ...positionRows, ...organizationRows]);
      return result;
    },
    async resolveAffectedUserIds(input) {
      const roleIds = unique(input.roleIds);
      if (roleIds.length === 0)
        return [];

      const [employmentRows, positionRows, organizationRows] = await Promise.all([
        loadUsersAffectedByEmploymentAssignments(db, roleIds),
        loadUsersAffectedByPositionAssignments(db, roleIds),
        loadUsersAffectedByOrganizationAssignments(db, roleIds),
      ]);
      return unique([...employmentRows, ...positionRows, ...organizationRows].map(row => row.userId))
        .sort((left, right) => left - right);
    },
  };
}

async function loadUsersAffectedByEmploymentAssignments(db: DbClient, roleIds: number[]) {
  return await db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(employments, eq(employments.id, roleAssignments.targetId))
    .where(and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
      inArray(roleAssignments.roleId, roleIds),
      activeEmploymentWhere(),
    ));
}

async function loadUsersAffectedByPositionAssignments(db: DbClient, roleIds: number[]) {
  return await db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(employments, eq(employments.posId, roleAssignments.targetId))
    .where(and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
      inArray(roleAssignments.roleId, roleIds),
      activeEmploymentWhere(),
    ));
}

async function loadUsersAffectedByOrganizationAssignments(db: DbClient, roleIds: number[]) {
  return await db
    .select({ userId: employments.userId })
    .from(roleAssignments)
    .innerJoin(organizationClosures, eq(organizationClosures.ancestorId, roleAssignments.targetId))
    .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
    .where(and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
      inArray(roleAssignments.roleId, roleIds),
      activeEmploymentWhere(),
      or(
        eq(organizationClosures.depth, 0),
        and(
          gt(organizationClosures.depth, 0),
          eq(roleAssignments.includeDescendants, true),
        ),
      ),
    ));
}

function activeEmploymentWhere() {
  return and(
    eq(employments.status, EmploymentStatus.Enable),
    eq(employments.isDelete, false),
  );
}

async function loadEmploymentAssignmentRoles(db: DbClient, employmentIds: number[], clientId?: number) {
  return await db
    .select(roleSelection())
    .from(employments)
    .innerJoin(roleAssignments, and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
      eq(roleAssignments.targetId, employments.id),
    ))
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(
      inArray(employments.id, employmentIds),
      strictEmploymentContextWhere(),
      activeRoleWhere(clientId),
    ));
}

async function loadPositionAssignmentRoles(db: DbClient, employmentIds: number[], clientId?: number) {
  return await db
    .select(roleSelection())
    .from(employments)
    .innerJoin(roleAssignments, and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
      eq(roleAssignments.targetId, employments.posId),
    ))
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(
      inArray(employments.id, employmentIds),
      strictEmploymentContextWhere(),
      activeRoleWhere(clientId),
    ));
}

async function loadOrganizationAssignmentRoles(db: DbClient, employmentIds: number[], clientId?: number) {
  return await db
    .select(roleSelection())
    .from(employments)
    .innerJoin(positions, eq(positions.id, employments.posId))
    .innerJoin(organizations, eq(organizations.id, employments.orgId))
    .innerJoin(organizationClosures, eq(organizationClosures.descendantId, employments.orgId))
    .innerJoin(roleAssignments, and(
      eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
      eq(roleAssignments.targetId, organizationClosures.ancestorId),
    ))
    .innerJoin(assignmentOrganization, eq(assignmentOrganization.id, roleAssignments.targetId))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(
      inArray(employments.id, employmentIds),
      strictEmploymentContextWhere(),
      eq(assignmentOrganization.status, OrganizationStatus.Enable),
      eq(assignmentOrganization.isDelete, false),
      activeRoleWhere(clientId),
      or(
        eq(organizationClosures.depth, 0),
        and(
          gt(organizationClosures.depth, 0),
          eq(roleAssignments.includeDescendants, true),
        ),
      ),
    ));
}

function strictEmploymentContextWhere() {
  return and(
    eq(employments.status, EmploymentStatus.Enable),
    eq(employments.isDelete, false),
    eq(positions.status, PositionStatus.Enable),
    eq(positions.isDelete, false),
    eq(organizations.status, OrganizationStatus.Enable),
    eq(organizations.isDelete, false),
  );
}

function activeRoleWhere(clientId: number | undefined) {
  return and(
    eq(roles.status, RoleStatus.Enable),
    eq(roles.isDelete, false),
    clientId === undefined ? undefined : eq(roles.clientId, clientId),
  );
}

function roleSelection() {
  return {
    employmentId: employments.id,
    id: roles.id,
    roleCode: roles.roleCode,
  };
}

function mergeRoleRows(result: Map<number, EffectiveRole[]>, rows: EmploymentRoleRow[]) {
  const seenByEmployment = new Map<number, Set<number>>();
  for (const row of rows) {
    const seenRoleIds = seenByEmployment.get(row.employmentId) ?? new Set<number>();
    if (!seenRoleIds.has(row.id)) {
      result.get(row.employmentId)?.push({ id: row.id, roleCode: row.roleCode });
      seenRoleIds.add(row.id);
      seenByEmployment.set(row.employmentId, seenRoleIds);
    }
  }

  for (const effectiveRoles of result.values())
    effectiveRoles.sort(compareEffectiveRoles);
}

function compareEffectiveRoles(left: EffectiveRole, right: EffectiveRole) {
  if (left.roleCode < right.roleCode)
    return -1;
  if (left.roleCode > right.roleCode)
    return 1;
  return left.id - right.id;
}

function unique(values: readonly number[]) {
  return [...new Set(values)];
}
