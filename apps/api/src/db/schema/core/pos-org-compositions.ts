import { boolean, index, integer, serial, snakeCase, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const posOrgCompositions = snakeCase.table("pos_org_composition", {
  id: serial().primaryKey(),
  posId: integer().notNull(),
  orgId: integer().notNull(),
  status: integer().notNull().default(1),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
}, table => [
  uniqueIndex("pos_org_composition_pos_id_org_id_key").on(table.posId, table.orgId),
  index("idx_org_id").on(table.orgId),
]);

export const selectPosOrgCompositionSchema = createSelectSchema(posOrgCompositions);
