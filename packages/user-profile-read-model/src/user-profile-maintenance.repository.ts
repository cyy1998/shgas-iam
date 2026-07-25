import type { DbClient } from "@iam/db";
import { users } from "@iam/db/schema";
import { asc, gt } from "drizzle-orm";

export function createUserProfileMaintenanceRepository(db: DbClient) {
  return {
    async scanUserIds(input: { afterUserId?: number; limit: number }) {
      const rows = await db
        .select({ userId: users.id })
        .from(users)
        .where(input.afterUserId === undefined ? undefined : gt(users.id, input.afterUserId))
        .orderBy(asc(users.id))
        .limit(input.limit);
      return rows.map(row => row.userId);
    },
  };
}

export type UserProfileMaintenanceRepository = ReturnType<typeof createUserProfileMaintenanceRepository>;
