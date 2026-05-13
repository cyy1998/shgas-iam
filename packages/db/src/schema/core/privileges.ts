import type { Json } from "drizzle-orm";
import { PrivilegeStatus } from "@iam/contracts";
import { boolean, integer, jsonb, serial, snakeCase, text, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { timestampColumns } from "../_shard/base-columns";

export const privileges = snakeCase.table("privilege", {
  id: serial().primaryKey(),
  privilegeCode: text().notNull().unique(),
  privilegeName: text().notNull(),
  fieldValues: jsonb().$type<Json>(),
  status: integer().$type<PrivilegeStatus>().notNull().default(PrivilegeStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
});

export const selectPrivilegeSchema = createSelectSchema(privileges, {
  status: () => z.enum(PrivilegeStatus),
});
