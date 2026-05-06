import type { DbClient } from "@api/db";
import db from "@api/db";
import { firstRow } from "@api/db/query-utils";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  positionRoles,
  rolePrivileges,
  roles,
} from "@api/db/schema";
import { Status } from "@api/enums/status";
import { and, eq, exists, inArray, or, sql } from "drizzle-orm";

function activeRoleWhere() {
  return and(eq(roles.status, Status.Enable), eq(roles.isDelete, false));
}

function roleAssignedToUserWhere(userId: number) {
  return or(
    exists(
      db.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(employments, eq(positionRoles.positionId, employments.posId))
        .where(and(
          eq(positionRoles.roleId, roles.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(organizationRoles)
        .innerJoin(employments, or(
          eq(organizationRoles.organizationId, employments.orgId),
          eq(organizationRoles.organizationId, employments.compId),
        ))
        .where(and(
          eq(organizationRoles.roleId, roles.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(employments, eq(employmentRoles.employmentId, employments.id))
        .where(and(
          eq(employmentRoles.roleId, roles.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
  );
}

function roleAssignedToEmploymentWhere(employmentId: number) {
  return or(
    exists(
      db.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(employments, eq(positionRoles.positionId, employments.posId))
        .where(and(
          eq(positionRoles.roleId, roles.id),
          eq(employments.id, employmentId),
          eq(employments.status, Status.Enable),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(organizationRoles)
        .innerJoin(employments, eq(employments.id, employmentId))
        .where(and(
          eq(organizationRoles.roleId, roles.id),
          eq(employments.status, Status.Enable),
          or(
            and(eq(organizationRoles.isAllSub, false), eq(organizationRoles.organizationId, employments.orgId)),
            and(
              eq(organizationRoles.isAllSub, true),
              exists(
                db.select({ value: sql`1` })
                  .from(organizationClosures)
                  .where(and(
                    eq(organizationClosures.ancestorId, organizationRoles.organizationId),
                    eq(organizationClosures.descendantId, employments.orgId),
                  )),
              ),
            ),
          ),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(employments, eq(employmentRoles.employmentId, employments.id))
        .where(and(
          eq(employmentRoles.roleId, roles.id),
          eq(employments.id, employmentId),
          eq(employments.status, Status.Enable),
        )),
    ),
  );
}

export async function getRoleByCode(roleCode: string, tx: DbClient = db) {
  return await tx.query.roles.findFirst({
    where: {
      roleCode,
      status: Status.Enable,
      isDelete: false,
    },
  }) ?? null;
}

export async function getRolesByUserId(userId: number, tx: DbClient = db) {
  return await tx.select().from(roles).where(and(activeRoleWhere(), roleAssignedToUserWhere(userId)));
}

export async function getRolesByAncestorOrgs(ancestorgIds: number[], tx: DbClient = db) {
  if (ancestorgIds.length === 0) {
    return [];
  }
  return await tx
    .select()
    .from(roles)
    .innerJoin(organizationRoles, eq(organizationRoles.roleId, roles.id))
    .where(and(
      inArray(organizationRoles.organizationId, ancestorgIds),
      eq(organizationRoles.isAllSub, true),
      activeRoleWhere(),
    ))
    .then(rows => rows.map(row => row.role));
}

export async function getRolesByDirectOrg(orgId: number, tx: DbClient = db) {
  return await tx
    .select()
    .from(roles)
    .innerJoin(organizationRoles, eq(organizationRoles.roleId, roles.id))
    .where(and(eq(organizationRoles.organizationId, orgId), activeRoleWhere()))
    .then(rows => rows.map(row => row.role));
}

export async function getRolesByPosition(posId: number, tx: DbClient = db) {
  return await tx
    .select()
    .from(roles)
    .innerJoin(positionRoles, eq(positionRoles.roleId, roles.id))
    .where(and(eq(positionRoles.positionId, posId), activeRoleWhere()))
    .then(rows => rows.map(row => row.role));
}

export async function getRolesByEmployment(employmentId: number, tx: DbClient = db) {
  return await tx
    .select()
    .from(roles)
    .innerJoin(employmentRoles, eq(employmentRoles.roleId, roles.id))
    .where(and(eq(employmentRoles.employmentId, employmentId), activeRoleWhere()))
    .then(rows => rows.map(row => row.role));
}

export async function getRolesByEmploymentId(employmentId: number, tx: DbClient = db) {
  return await tx.select().from(roles).where(and(activeRoleWhere(), roleAssignedToEmploymentWhere(employmentId)));
}

export async function checkEmploymentRoleExisting(
  roleId: number,
  employmentId: number,
  tx: DbClient = db,
) {
  return await tx.query.employmentRoles.findFirst({
    where: { roleId, employmentId },
  }) !== undefined;
}

export async function setRole(roleCode: string, roleName: string, tx: DbClient = db) {
  return firstRow(await tx.insert(roles).values({
    roleCode,
    roleName,
    clientId: 1,
  }).returning())!;
}

export async function setRolePrivilege(roleId: number, privilegeId: number, tx: DbClient = db) {
  return firstRow(await tx.insert(rolePrivileges).values({ roleId, privilegeId }).returning())!;
}

export async function setRoleForEmployment(roleId: number, employmentId: number, tx: DbClient = db) {
  return firstRow(await tx.insert(employmentRoles).values({ roleId, employmentId }).returning())!;
}

export async function setRoleForOrganization(roleId: number, orgId: number, tx: DbClient = db) {
  return firstRow(await tx.insert(organizationRoles).values({ roleId, organizationId: orgId }).returning())!;
}

export async function setRoleForPosition(roleId: number, posId: number, tx: DbClient = db) {
  return firstRow(await tx.insert(positionRoles).values({ roleId, positionId: posId }).returning())!;
}

export async function deleteRoleForEmployment(roleId: number, employmentId: number, tx: DbClient = db) {
  return await tx.delete(employmentRoles).where(and(
    eq(employmentRoles.roleId, roleId),
    eq(employmentRoles.employmentId, employmentId),
  ));
}
