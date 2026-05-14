import { RoleStatus } from "@iam/contracts";
import { index, integer, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const roles = snakeCase.table("role", {
  id: baseColumns.id,
  roleCode: varchar({ length: 64 }).notNull().unique(),
  roleName: varchar({ length: 128 }).notNull(),
  clientId: integer().notNull(),
  status: integer().$type<RoleStatus>().notNull().default(RoleStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("idx_client_id").on(table.clientId),
]);

export const selectRoleSchema = createSelectSchema(roles, {
  status: () => z.enum(RoleStatus),
});
export const insertRoleSchema = createInsertSchema(roles, {
  status: () => z.enum(RoleStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateRoleSchema = createUpdateSchema(roles, {
  status: () => z.enum(RoleStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
