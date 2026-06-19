import type { Prettify } from "@api/utils/lint.util";
import type { DbClient } from "@iam/db";
import type { PrivilegeQueryDto } from "./privilege.type";
import { inArrayIf } from "@iam/db/query-utils";
import {
  privileges,
  rolePrivileges,
  roles,
} from "@iam/db/schema";
import { and, eq, exists, inArray, sql } from "drizzle-orm";

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
    async searchPrivileges(query: Prettify<PrivilegeQueryDto>) {
      return await db.select().from(privileges).where(and(
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
    },
  };
}

export type PrivilegeRepository = ReturnType<typeof createPrivilegeRepository>;
