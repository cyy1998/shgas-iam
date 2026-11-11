import { RoleKind, RoleStatus, RoleType } from "@iam/contracts";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";
import { clients } from "./clients";

export const roleKindEnum = pgEnum("role_kind", [RoleKind.Basic, RoleKind.Composite]);

export const roles = snakeCase.table(
  "role",
  {
    id: baseColumns.id,
    roleCode: varchar({ length: 64 }).notNull().unique(),
    roleName: varchar({ length: 128 }).notNull(),
    roleKind: roleKindEnum().notNull().default(RoleKind.Basic),
    roleType: varchar({ length: 16 }).$type<RoleType>().notNull().default(RoleType.Client),
    clientId: integer(),
    status: integer().$type<RoleStatus>().notNull().default(RoleStatus.Enable),
    description: varchar({ length: 500 }),
    isDelete: baseColumns.isDelete,
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    index("idx_client_id").on(table.clientId),
    foreignKey({
      name: "role_client_id_fkey",
      columns: [table.clientId],
      foreignColumns: [clients.id],
    }),
    // Use the same WhiteSpace and LineTerminator characters as String.prototype.trim().
    check(
      "role_type_ownership_check",
      sql`(
        (${table.roleType} = 'client' AND ${table.clientId} IS NOT NULL AND NOT starts_with(${table.roleCode}, 'global:'))
        OR
        (${table.roleType} = 'global' AND ${table.clientId} IS NULL
          AND starts_with(${table.roleCode}, 'global:')
          AND length(btrim(
            substring(${table.roleCode} from 8),
            U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'
          )) > 0)
      )`,
    ),
  ],
);

export const selectRoleSchema = createSelectSchema(roles, {
  roleType: () => z.enum(RoleType),
  status: () => z.enum(RoleStatus),
});
export const insertRoleSchema = createInsertSchema(roles, {
  roleType: () => z.enum(RoleType),
  status: () => z.enum(RoleStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateRoleSchema = createUpdateSchema(roles, {
  roleType: () => z.enum(RoleType),
  status: () => z.enum(RoleStatus),
}).omit({ id: true, roleKind: true, createTime: true, updateTime: true, isDelete: true });
