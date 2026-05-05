import { index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export const posOrgRoles = snakeCase.table("position_organization_role", {
  posOrgId: integer().notNull(),
  roleId: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.posOrgId, table.roleId] }),
  index("idx_pos_org_role_role_id").on(table.roleId),
]);

export const selectPosOrgRoleSchema = createSelectSchema(posOrgRoles);
