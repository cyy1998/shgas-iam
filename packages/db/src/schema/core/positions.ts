import { PositionStatus } from "@iam/contracts";
import { type CustomAttributeValues, CustomAttributeValuesSchema } from "@iam/contracts/custom-attributes";
import { sql } from "drizzle-orm";
import { check, integer, jsonb, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const positions = snakeCase.table(
  "position",
  {
    id: baseColumns.id,
    posCode: varchar("post_code", { length: 64 }).notNull().unique(),
    posName: varchar("post_name", { length: 128 }).notNull(),
    status: integer().$type<PositionStatus>().notNull().default(PositionStatus.Enable),
    description: varchar({ length: 500 }),
    customAttributes: jsonb().$type<CustomAttributeValues>().notNull().default(sql`'{}'::jsonb`),
    isDelete: baseColumns.isDelete,
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    check("position_custom_attributes_object_check", sql`jsonb_typeof(${table.customAttributes}) = 'object'`),
  ],
);

export const selectPositionSchema = createSelectSchema(positions, {
  customAttributes: () => CustomAttributeValuesSchema,
  status: () => z.enum(PositionStatus),
});
export const insertPositionSchema = createInsertSchema(positions, {
  customAttributes: () => CustomAttributeValuesSchema,
  status: () => z.enum(PositionStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updatePositionSchema = createUpdateSchema(positions, {
  customAttributes: () => CustomAttributeValuesSchema,
  status: () => z.enum(PositionStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
