import { boolean, integer, jsonb, serial, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const clients = snakeCase.table("client", {
  id: serial().primaryKey(),
  clientCode: varchar({ length: 64 }).notNull().unique(),
  clientName: varchar({ length: 128 }).notNull(),
  clientSecret: varchar({ length: 255 }).notNull(),
  url: varchar({ length: 128 }),
  status: integer().notNull().default(1),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
  extAttributes: jsonb().$type<unknown>().notNull(),
});

export const selectClientSchema = createSelectSchema(clients);
