import { index, integer, serial, snakeCase, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";

export const organizationClosures = snakeCase.table("organization_closure", {
  id: serial().primaryKey(),
  ancestorId: integer().notNull(),
  descendantId: integer().notNull(),
  depth: integer().notNull(),
}, table => [
  uniqueIndex("organization_closure_ancestor_id_descendant_id_key").on(table.ancestorId, table.descendantId),
  index("organization_closure_ancestor_id_idx").on(table.ancestorId),
  index("organization_closure_descendant_id_idx").on(table.descendantId),
]);

export const selectOrganizationClosureSchema = createSelectSchema(organizationClosures);
export const insertOrganizationClosureSchema = createInsertSchema(organizationClosures);
export const updateOrganizationClosureSchema = createUpdateSchema(organizationClosures);
