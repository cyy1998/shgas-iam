import { boolean, index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export const organizationRoles = snakeCase.table("organization_role", {
  organizationId: integer().notNull(),
  roleId: integer().notNull(),
  isAllSub: boolean().notNull().default(true),
}, table => [
  primaryKey({ columns: [table.organizationId, table.roleId] }),
  index("idx_organization_role_role_id").on(table.roleId),
]);

export const selectOrganizationRoleSchema = createSelectSchema(organizationRoles);
