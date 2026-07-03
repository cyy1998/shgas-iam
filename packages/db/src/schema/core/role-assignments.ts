import { RoleAssignmentTargetType } from "@iam/contracts";
import { boolean, index, integer, snakeCase, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const roleAssignments = snakeCase.table("role_assignment", {
  id: baseColumns.id,
  roleId: integer().notNull(),
  targetType: varchar({ length: 32 }).$type<RoleAssignmentTargetType>().notNull(),
  targetId: integer().notNull(),
  includeDescendants: boolean().notNull().default(false),
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  uniqueIndex("role_assignment_role_id_target_type_target_id_key").on(
    table.roleId,
    table.targetType,
    table.targetId,
  ),
  index("idx_role_assignment_role_id").on(table.roleId),
  index("idx_role_assignment_target").on(table.targetType, table.targetId),
]);

export const selectRoleAssignmentSchema = createSelectSchema(roleAssignments, {
  targetType: () => z.enum(RoleAssignmentTargetType),
});
export const insertRoleAssignmentSchema = createInsertSchema(roleAssignments, {
  targetType: () => z.enum(RoleAssignmentTargetType),
}).omit({ id: true, createTime: true, updateTime: true });
export const updateRoleAssignmentSchema = createUpdateSchema(roleAssignments, {
  targetType: () => z.enum(RoleAssignmentTargetType),
}).omit({ id: true, createTime: true, updateTime: true });
