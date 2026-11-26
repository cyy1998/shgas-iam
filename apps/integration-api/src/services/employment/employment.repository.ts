import { EmploymentStatus, OPEN_EMPLOYMENT_STATUSES } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import { employments, organizationClosures, organizations, positions, users } from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export function createEmploymentRepository(db: DbClient) {
  return {
    async getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number) {
      const [row] = await db
        .select({ id: employments.id })
        .from(employments)
        .innerJoin(users, eq(users.id, employments.userId))
        .innerJoin(positions, eq(positions.id, employments.posId))
        .innerJoin(organizations, and(eq(organizations.id, employments.orgId), eq(organizations.isDelete, false)))
        .innerJoin(
          organizationClosures,
          and(
            eq(organizationClosures.ancestorId, employments.orgId),
            eq(organizationClosures.descendantId, employments.orgId),
          ),
        )
        .where(
          and(
            eq(employments.userId, userId),
            eq(employments.orgId, orgId),
            eq(employments.posId, posId),
            inArray(employments.status, [...OPEN_EMPLOYMENT_STATUSES]),
            eq(employments.isDelete, false),
          ),
        )
        .limit(1);
      return row ?? null;
    },
    async setEmployment(userId: number, posId: number, orgId: number) {
      return firstRow(
        await db
          .insert(employments)
          .values({
            userId,
            posId,
            orgId,
            status: EmploymentStatus.Enable,
            startTime: null,
            endTime: null,
          })
          .returning(),
      )!;
    },
  };
}

export type EmploymentRepository = ReturnType<typeof createEmploymentRepository>;
