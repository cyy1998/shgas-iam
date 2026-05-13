import type { z } from "zod";
import { EmploymentStatus } from "@iam/contracts";
import { boolean, index, integer, serial, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const employments = snakeCase.table("employment", {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  posId: integer().notNull(),
  orgId: integer("dept_id").notNull(),
  compId: integer().notNull(),
  isPrimary: boolean().notNull().default(false),
  status: integer().$type<EmploymentStatus>().notNull().default(EmploymentStatus.Enable),
  startTime: timestamp().notNull().defaultNow(),
  endTime: timestamp(),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
}, table => [
  index("idx_employment_user_id").on(table.userId),
  index("idx_dept_id").on(table.orgId),
  index("idx_comp_id").on(table.compId),
  index("idx_pos_id").on(table.posId),
  index("idx_pos_dept_id").on(table.posId, table.orgId),
]);

export const selectEmploymentSchema = createSelectSchema(employments);

export type Employment = z.infer<typeof selectEmploymentSchema>;
