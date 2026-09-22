import type { DbClient } from "@iam/db";
import { PrivilegeStatus } from "@iam/contracts";
import {
  privileges,
  rolePrivileges,
} from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export function createPrivilegeRepository(db: DbClient) {
  return {
    async getPrivilegesByRoleIds(roleIds: number[]) {
      if (roleIds.length === 0) {
        return [];
      }
      return await db
        .selectDistinct({
          privilegeCode: privileges.privilegeCode,
          privilegeName: privileges.privilegeName,
        })
        .from(privileges)
        .innerJoin(rolePrivileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          inArray(rolePrivileges.roleId, roleIds),
          eq(privileges.status, PrivilegeStatus.Enable),
          eq(privileges.isDelete, false),
        ));
    },
  };
}

export type PrivilegeRepository = ReturnType<typeof createPrivilegeRepository>;
