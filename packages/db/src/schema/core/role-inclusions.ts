import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { roles } from "./roles";

export const roleInclusions = snakeCase.table(
  "role_inclusion",
  {
    containerRoleId: integer()
      .notNull()
      .references(() => roles.id),
    memberRoleId: integer()
      .notNull()
      .references(() => roles.id),
  },
  (table) => [
    primaryKey({ columns: [table.containerRoleId, table.memberRoleId] }),
    index("role_inclusion_member_role_id_idx").on(table.memberRoleId),
    check("role_inclusion_distinct_roles_check", sql`${table.containerRoleId} <> ${table.memberRoleId}`),
  ],
);
