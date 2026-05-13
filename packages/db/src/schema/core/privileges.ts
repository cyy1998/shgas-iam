import type { Json } from "drizzle-orm";
import { PrivilegeStatus } from "@iam/contracts";
import { integer, jsonb, snakeCase, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema, jsonSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const privilegeFieldValuesSchema = jsonSchema;

export const privileges = snakeCase.table("privilege", {
  id: baseColumns.id,
  privilegeCode: text().notNull().unique(),
  privilegeName: text().notNull(),
  fieldValues: jsonb().$type<Json>(),
  status: integer().$type<PrivilegeStatus>().notNull().default(PrivilegeStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
});

export const selectPrivilegeSchema = createSelectSchema(privileges, {
  fieldValues: () => privilegeFieldValuesSchema,
  status: () => z.enum(PrivilegeStatus),
});
export const insertPrivilegeSchema = createInsertSchema(privileges, {
  fieldValues: () => privilegeFieldValuesSchema,
  status: () => z.enum(PrivilegeStatus),
});
export const updatePrivilegeSchema = createUpdateSchema(privileges, {
  fieldValues: () => privilegeFieldValuesSchema,
  status: () => z.enum(PrivilegeStatus),
});
