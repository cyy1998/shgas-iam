import type { DbClient } from "@api/db";
import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeQueryDto } from "./privilege.type";
import db from "@api/db";
import { firstRow, inArrayIf } from "@api/db/query-utils";
import {
  employmentRoles,
  employments,
  organizationRoles,
  positionRoles,
  privileges,
  rolePrivileges,
  roles,
} from "@api/db/schema";
import { Status } from "@api/enums/status";
import { and, eq, exists, inArray, or, sql } from "drizzle-orm";

export async function getPrivilegesByUserId(userId: number, tx: DbClient = db) {
  return await tx.select().from(privileges).where(or(
    exists(
      db.select({ value: sql`1` })
        .from(rolePrivileges)
        .innerJoin(positionRoles, eq(positionRoles.roleId, rolePrivileges.roleId))
        .innerJoin(employments, eq(positionRoles.positionId, employments.posId))
        .where(and(
          eq(rolePrivileges.privilegeId, privileges.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(rolePrivileges)
        .innerJoin(organizationRoles, eq(organizationRoles.roleId, rolePrivileges.roleId))
        .innerJoin(employments, or(
          eq(organizationRoles.organizationId, employments.orgId),
          eq(organizationRoles.organizationId, employments.compId),
        ))
        .where(and(
          eq(rolePrivileges.privilegeId, privileges.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(rolePrivileges)
        .innerJoin(employmentRoles, eq(employmentRoles.roleId, rolePrivileges.roleId))
        .innerJoin(employments, eq(employmentRoles.employmentId, employments.id))
        .where(and(
          eq(rolePrivileges.privilegeId, privileges.id),
          eq(employments.userId, userId),
          eq(employments.status, Status.Enable),
        )),
    ),
  ));
}

export async function getPrivilegesByRoleIds(roleIds: number[], tx: DbClient = db) {
  if (roleIds.length === 0) {
    return [];
  }
  return await tx
    .select()
    .from(privileges)
    .innerJoin(rolePrivileges, eq(rolePrivileges.privilegeId, privileges.id))
    .where(inArray(rolePrivileges.roleId, roleIds))
    .then(rows => rows.map(row => row.privilege));
}

export async function getPrivilegeByCode(privCode: string, tx: DbClient = db) {
  return await tx.query.privileges.findFirst({
    where: {
      privilegeCode: privCode,
    },
  }) ?? null;
}

export async function setPrivilege(privCode: string, privName: string, tx: DbClient = db) {
  return firstRow(await tx.insert(privileges).values({
    privilegeCode: privCode,
    privilegeName: privName,
  }).returning())!;
}

export async function searchPrivileges(
  query: Prettify<PrivilegeQueryDto>,
  tx: DbClient = db,
) {
  return await tx.select().from(privileges).where(and(
    inArrayIf(privileges.privilegeCode, query.privilegeCodes),
    query.roleCodes === undefined
      ? undefined
      : exists(
          db.select({ value: sql`1` })
            .from(rolePrivileges)
            .innerJoin(roles, eq(rolePrivileges.roleId, roles.id))
            .where(and(
              eq(rolePrivileges.privilegeId, privileges.id),
              inArrayIf(roles.roleCode, query.roleCodes),
            )),
        ),
  ));
}
