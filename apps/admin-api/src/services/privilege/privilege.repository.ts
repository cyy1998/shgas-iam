import type { DbClient } from "@iam/db";
import db from "@iam/db";
import {
  privileges,
  rolePrivileges,
} from "@iam/db/schema";
import { eq, inArray } from "drizzle-orm";

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
