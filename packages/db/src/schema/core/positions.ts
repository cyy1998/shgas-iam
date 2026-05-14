import { PositionStatus } from "@iam/contracts";
import { integer, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const positions = snakeCase.table("position", {
  id: baseColumns.id,
  posCode: varchar("post_code", { length: 64 }).notNull().unique(),
  posName: varchar("post_name", { length: 128 }).notNull(),
  status: integer().$type<PositionStatus>().notNull().default(PositionStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
});

export const selectPositionSchema = createSelectSchema(positions, {
  status: () => z.enum(PositionStatus),
});
export const insertPositionSchema = createInsertSchema(positions, {
  status: () => z.enum(PositionStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updatePositionSchema = createUpdateSchema(positions, {
  status: () => z.enum(PositionStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
