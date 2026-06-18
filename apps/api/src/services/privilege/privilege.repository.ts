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
    getPrivilegesByRoleIds(roleIds: number[]) {
      return getPrivilegesByRoleIds(roleIds, db);
    },
    searchPrivileges(query: Prettify<PrivilegeQueryDto>) {
      return searchPrivileges(query, db);
    },
  };
}

export type PrivilegeRepository = ReturnType<typeof createPrivilegeRepository>;

async function getPrivilegesByRoleIds(roleIds: number[], tx: DbClient) {
  if (roleIds.length === 0) {
    return [];
  }
  return await tx
    .select()
    .from(privileges)
    .innerJoin(rolePrivileges, eq(rolePrivileges.privilegeId, privileges.id))
    .where(inArray(rolePrivileges.roleId, roleIds))
    .then(rows => rows.map(row => row.privilege));
}

async function searchPrivileges(
  query: Prettify<PrivilegeQueryDto>,
  tx: DbClient,
) {
  return await tx.select().from(privileges).where(and(
    inArrayIf(privileges.privilegeCode, query.privilegeCodes),
    query.roleCodes === undefined
      ? undefined
      : exists(
          tx.select({ value: sql`1` })
            .from(rolePrivileges)
            .innerJoin(roles, eq(rolePrivileges.roleId, roles.id))
            .where(and(
              eq(rolePrivileges.privilegeId, privileges.id),
              inArrayIf(roles.roleCode, query.roleCodes),
            )),
        ),
  ));
}
