import { index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export const employmentRoles = snakeCase.table("employment_role", {
  employmentId: integer().notNull(),
  roleId: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.employmentId, table.roleId] }),
  index("idx_employment_role_role_id").on(table.roleId),
]);

export const selectEmploymentRoleSchema = createSelectSchema(employmentRoles);
