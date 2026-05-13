import { index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";

export const rolePrivileges = snakeCase.table("role_privilege", {
  roleId: integer().notNull(),
  privilegeId: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.roleId, table.privilegeId] }),
  index("idx_privilege_id").on(table.privilegeId),
]);

export const selectRolePrivilegeSchema = createSelectSchema(rolePrivileges);
export const insertRolePrivilegeSchema = createInsertSchema(rolePrivileges);
export const updateRolePrivilegeSchema = createUpdateSchema(rolePrivileges);
