import { index, integer, primaryKey, snakeCase } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";

export const delegationDetails = snakeCase.table("delegation_detail", {
  delegationId: integer().notNull(),
  privilegeId: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.delegationId, table.privilegeId] }),
  index("idx_privilege").on(table.privilegeId),
]);

export const selectDelegationDetailSchema = createSelectSchema(delegationDetails);
export const insertDelegationDetailSchema = createInsertSchema(delegationDetails);
export const updateDelegationDetailSchema = createUpdateSchema(delegationDetails);
