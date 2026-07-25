import type { DbClient } from "@iam/db";
import { EmploymentStatus } from "@iam/contracts";
import { employments, organizationClosures } from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";

interface UserProfileAffectedUserResolverPort {
  resolveAffectedUserIds: (input: { roleIds: readonly number[] }) => Promise<readonly number[]>;
}

export function createUserProfileAffectedUserRepository(
  db: DbClient,
  roleAssignmentResolver: UserProfileAffectedUserResolverPort,
) {
  return {
    async findByOrganizationIds(organizationIds: readonly number[]) {
      if (organizationIds.length === 0)
        return [];

      const rows = await db
        .select({ userId: employments.userId })
        .from(organizationClosures)
        .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
        .where(and(
          inArray(organizationClosures.ancestorId, organizationIds),
          eq(employments.status, EmploymentStatus.Enable),
          eq(employments.isDelete, false),
        ));
      return uniqueUserIds(rows);
    },

    async findByPositionIds(positionIds: readonly number[]) {
      if (positionIds.length === 0)
        return [];

      const rows = await db
        .select({ userId: employments.userId })
        .from(employments)
        .where(and(
          inArray(employments.posId, positionIds),
          eq(employments.status, EmploymentStatus.Enable),
          eq(employments.isDelete, false),
        ));
      return uniqueUserIds(rows);
    },

    async findByEmploymentIds(employmentIds: readonly number[]) {
      if (employmentIds.length === 0)
        return [];

      const rows = await db
        .select({ userId: employments.userId })
        .from(employments)
        .where(inArray(employments.id, employmentIds));
      return uniqueUserIds(rows);
    },

    async findByRoleIds(roleIds: readonly number[]) {
      return [...await roleAssignmentResolver.resolveAffectedUserIds({ roleIds })];
    },
  };
}

function uniqueUserIds(rows: Array<{ userId: number }>) {
  return [...new Set(rows.map(row => row.userId))];
}
