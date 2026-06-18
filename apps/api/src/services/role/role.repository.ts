import type { DbClient } from "@iam/db";
import { EmploymentStatus, RoleStatus } from "@iam/contracts";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  positionRoles,
  roles,
} from "@iam/db/schema";
import { and, eq, exists, or, sql } from "drizzle-orm";

export function createRoleRepository(db: DbClient) {
  return {
    getRolesByEmploymentId(employmentId: number) {
      return getRolesByEmploymentId(employmentId, db);
    },
  };
}

export type RoleRepository = ReturnType<typeof createRoleRepository>;

function activeRoleWhere() {
  return and(eq(roles.status, RoleStatus.Enable), eq(roles.isDelete, false));
}

function roleAssignedToEmploymentWhere(employmentId: number, tx: DbClient) {
  return or(
    exists(
      tx.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(employments, eq(positionRoles.positionId, employments.posId))
        .where(and(
          eq(positionRoles.roleId, roles.id),
          eq(employments.id, employmentId),
          eq(employments.status, EmploymentStatus.Enable),
        )),
    ),
    exists(
      tx.select({ value: sql`1` })
        .from(organizationRoles)
        .innerJoin(employments, eq(employments.id, employmentId))
        .where(and(
          eq(organizationRoles.roleId, roles.id),
          eq(employments.status, EmploymentStatus.Enable),
          or(
            and(eq(organizationRoles.isAllSub, false), eq(organizationRoles.organizationId, employments.orgId)),
            and(
              eq(organizationRoles.isAllSub, true),
              exists(
                tx.select({ value: sql`1` })
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
      tx.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(employments, eq(employmentRoles.employmentId, employments.id))
        .where(and(
          eq(employmentRoles.roleId, roles.id),
          eq(employments.id, employmentId),
          eq(employments.status, EmploymentStatus.Enable),
        )),
    ),
  );
}

async function getRolesByEmploymentId(employmentId: number, tx: DbClient) {
  return await tx.select().from(roles).where(and(activeRoleWhere(), roleAssignedToEmploymentWhere(employmentId, tx)));
}
