import { index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";

export const positionRoles = snakeCase.table("position_role", {
  positionId: integer().notNull(),
  roleId: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.positionId, table.roleId] }),
  index("idx_position_role_role_id").on(table.roleId),
]);

export const selectPositionRoleSchema = createSelectSchema(positionRoles);
export const insertPositionRoleSchema = createInsertSchema(positionRoles);
export const updatePositionRoleSchema = createUpdateSchema(positionRoles);
