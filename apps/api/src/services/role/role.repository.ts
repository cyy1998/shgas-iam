import type { DbClient } from "@iam/db";
import { Status } from "@api/enums/status";
import db from "@iam/db";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  positionRoles,
  roles,
} from "@iam/db/schema";
import { and, eq, exists, or, sql } from "drizzle-orm";

function activeRoleWhere() {
  return and(eq(roles.status, Status.Enable), eq(roles.isDelete, false));
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

export async function getRolesByEmploymentId(employmentId: number, tx: DbClient = db) {
  return await tx.select().from(roles).where(and(activeRoleWhere(), roleAssignedToEmploymentWhere(employmentId)));
}
