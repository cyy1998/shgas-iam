import type { DbClient } from "@iam/db";
import {
  privileges,
  rolePrivileges,
} from "@iam/db/schema";
import { eq, inArray } from "drizzle-orm";

export function createPrivilegeRepository(db: DbClient) {
  return {
    async getPrivilegesByRoleIds(roleIds: number[]) {
      if (roleIds.length === 0) {
        return [];
      }
      return await db
        .select()
        .from(privileges)
        .innerJoin(rolePrivileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(inArray(rolePrivileges.roleId, roleIds))
        .then(rows => rows.map(row => row.privilege));
    },
  };
}

export type PrivilegeRepository = ReturnType<typeof createPrivilegeRepository>;
