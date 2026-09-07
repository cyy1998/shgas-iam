import type { db as database } from "@iam/db";
import type { EmploymentInventoryRow } from "./employment-verifier";
import { employments, organizations, positions } from "@iam/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export function createEmploymentRepository(db: typeof database) {
  async function readAll(): Promise<EmploymentInventoryRow[]> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await tx
        .select({
          id: employments.id,
          userId: employments.userId,
          positionId: employments.posId,
          organizationId: employments.orgId,
          isPrimary: employments.isPrimary,
          status: employments.status,
          startTime: employments.startTime,
          endTime: employments.endTime,
          isDelete: employments.isDelete,
          positionStatus: positions.status,
          positionDeleted: positions.isDelete,
          organizationStatus: organizations.status,
          organizationDeleted: organizations.isDelete,
        })
        .from(employments)
        .leftJoin(positions, eq(positions.id, employments.posId))
        .leftJoin(organizations, eq(organizations.id, employments.orgId))
        .orderBy(asc(employments.id));
    });
  }

  return { readAll };
}
