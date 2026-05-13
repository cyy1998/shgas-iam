import { PositionStatus } from "@iam/contracts";
import { boolean, integer, serial, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const positions = snakeCase.table("position", {
  id: serial().primaryKey(),
  posCode: varchar("post_code", { length: 64 }).notNull().unique(),
  posName: varchar("post_name", { length: 128 }).notNull(),
  status: integer().$type<PositionStatus>().notNull().default(PositionStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
});

export const selectPositionSchema = createSelectSchema(positions);
