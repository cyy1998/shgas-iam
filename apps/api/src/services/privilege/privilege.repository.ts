import type { DbClient } from "@api/db";
import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeQueryDto } from "./privilege.type";
import db from "@api/db";
import { inArrayIf } from "@api/db/query-utils";
import {
  privileges,
  rolePrivileges,
  roles,
} from "@api/db/schema";
import { and, eq, exists, inArray, sql } from "drizzle-orm";

export async function getPrivilegesByRoleIds(roleIds: number[], tx: DbClient = db) {
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

export async function searchPrivileges(
  query: Prettify<PrivilegeQueryDto>,
  tx: DbClient = db,
) {
  return await tx.select().from(privileges).where(and(
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
}
