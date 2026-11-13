import { EmploymentStatus, OPEN_EMPLOYMENT_STATUSES } from "@iam/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, snakeCase, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const employments = snakeCase.table(
  "employment",
  {
    id: baseColumns.id,
    userId: integer().notNull(),
    posId: integer().notNull(),
    orgId: integer("dept_id").notNull(),
    isPrimary: boolean().notNull().default(false),
    status: integer().$type<EmploymentStatus>().notNull().default(EmploymentStatus.Enable),
    startTime: date({ mode: "string" }),
    endTime: date({ mode: "string" }),
    description: varchar({ length: 500 }),
    isDelete: baseColumns.isDelete,
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    uniqueIndex("employment_active_relationship_unique_idx")
      .on(table.userId, table.orgId, table.posId)
      .where(
        sql`${table.isDelete} = false AND ${table.status} IN (${sql.join([...OPEN_EMPLOYMENT_STATUSES], sql`, `)})`,
      ),
    index("idx_employment_user_id").on(table.userId),
    index("idx_dept_id").on(table.orgId),
    index("idx_pos_id").on(table.posId),
    index("idx_pos_dept_id").on(table.posId, table.orgId),
    check("employment_period_check", sql`${table.startTime} < ${table.endTime}`),
  ],
);

const employmentSchemaRefinements = {
  status: () => z.enum(EmploymentStatus),
  startTime: () => z.iso.date(),
  endTime: () => z.iso.date(),
};

export const selectEmploymentSchema = createSelectSchema(employments, employmentSchemaRefinements);
export const insertEmploymentSchema = createInsertSchema(employments, employmentSchemaRefinements).omit({
  id: true,
  createTime: true,
  updateTime: true,
  isDelete: true,
});
export const updateEmploymentSchema = createUpdateSchema(employments, employmentSchemaRefinements).omit({
  id: true,
  createTime: true,
  updateTime: true,
  isDelete: true,
});

export type Employment = z.infer<typeof selectEmploymentSchema>;
