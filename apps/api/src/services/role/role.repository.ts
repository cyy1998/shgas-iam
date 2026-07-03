import type { DbClient } from "@iam/db";
import { EmploymentStatus, RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import {
  employments,
  organizationClosures,
  roleAssignments,
  roles,
} from "@iam/db/schema";
import { and, eq, exists, gt, or, sql } from "drizzle-orm";

export function createRoleRepository(db: DbClient) {
  return {
    async getRolesByEmploymentId(employmentId: number) {
      return await db
        .select()
        .from(roles)
        .where(and(activeRoleWhere(), roleAssignedToEmploymentWhere(employmentId, db)));
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
        .from(roleAssignments)
        .innerJoin(employments, eq(roleAssignments.targetId, employments.posId))
        .where(and(
          eq(roleAssignments.roleId, roles.id),
          eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
          eq(employments.id, employmentId),
          eq(employments.status, EmploymentStatus.Enable),
        )),
    ),
    exists(
      tx.select({ value: sql`1` })
        .from(roleAssignments)
        .innerJoin(employments, eq(employments.id, employmentId))
        .where(and(
          eq(roleAssignments.roleId, roles.id),
          eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
          eq(employments.status, EmploymentStatus.Enable),
          or(
            eq(roleAssignments.targetId, employments.orgId),
            and(
              eq(roleAssignments.includeDescendants, true),
              exists(
                tx.select({ value: sql`1` })
                  .from(organizationClosures)
                  .where(and(
                    eq(organizationClosures.ancestorId, roleAssignments.targetId),
                    eq(organizationClosures.descendantId, employments.orgId),
                    gt(organizationClosures.depth, 0),
                  )),
              ),
            ),
          ),
        )),
    ),
    exists(
      tx.select({ value: sql`1` })
        .from(roleAssignments)
        .innerJoin(employments, eq(roleAssignments.targetId, employments.id))
        .where(and(
          eq(roleAssignments.roleId, roles.id),
          eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
          eq(employments.id, employmentId),
          eq(employments.status, EmploymentStatus.Enable),
        )),
    ),
  );
}
