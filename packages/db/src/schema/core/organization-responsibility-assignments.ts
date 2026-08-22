import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const organizationResponsibilityAssignments = snakeCase.table(
  "organization_responsibility_assignment",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    employmentId: integer().notNull(),
    typeCode: text().$type<OrganizationResponsibilityTypeCode>().notNull(),
    targetOrganizationId: integer().notNull(),
    status: integer().$type<OrganizationResponsibilityAssignmentStatus>().notNull(),
    startTime: timestamp({ withTimezone: true }).notNull(),
    endTime: timestamp({ withTimezone: true }),
    createTime: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updateTime: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex("org_resp_assignment_open_head_unique_idx")
      .on(table.targetOrganizationId, table.typeCode)
      .where(sql`
        ${table.typeCode} = ${OrganizationResponsibilityTypeCode.Head}
        AND ${table.status} IN (
          ${OrganizationResponsibilityAssignmentStatus.Enable},
          ${OrganizationResponsibilityAssignmentStatus.Pause}
        )
      `),
    uniqueIndex("org_resp_assignment_open_supervising_unique_idx")
      .on(table.targetOrganizationId, table.typeCode, table.employmentId)
      .where(sql`
        ${table.typeCode} = ${OrganizationResponsibilityTypeCode.Supervising}
        AND ${table.status} IN (
          ${OrganizationResponsibilityAssignmentStatus.Enable},
          ${OrganizationResponsibilityAssignmentStatus.Pause}
        )
      `),
    index("organization_responsibility_assignment_employment_id_idx")
      .on(table.employmentId),
    check(
      "organization_responsibility_assignment_type_code_check",
      sql`${table.typeCode} IN (
        ${OrganizationResponsibilityTypeCode.Head},
        ${OrganizationResponsibilityTypeCode.Supervising}
      )`,
    ),
    check(
      "organization_responsibility_assignment_status_check",
      sql`${table.status} IN (
        ${OrganizationResponsibilityAssignmentStatus.Enable},
        ${OrganizationResponsibilityAssignmentStatus.Pause},
        ${OrganizationResponsibilityAssignmentStatus.Disable}
      )`,
    ),
    check(
      "organization_responsibility_assignment_period_check",
      sql`(
        ${table.status} IN (
          ${OrganizationResponsibilityAssignmentStatus.Enable},
          ${OrganizationResponsibilityAssignmentStatus.Pause}
        )
        AND ${table.endTime} IS NULL
      ) OR (
        ${table.status} = ${OrganizationResponsibilityAssignmentStatus.Disable}
        AND ${table.endTime} IS NOT NULL
        AND ${table.endTime} >= ${table.startTime}
      )`,
    ),
  ],
);

export const selectOrganizationResponsibilityAssignmentSchema = createSelectSchema(
  organizationResponsibilityAssignments,
  {
    status: () => z.enum(OrganizationResponsibilityAssignmentStatus),
    typeCode: () => z.enum(OrganizationResponsibilityTypeCode),
  },
);

export const insertOrganizationResponsibilityAssignmentSchema = createInsertSchema(
  organizationResponsibilityAssignments,
  {
    status: () => z.enum(OrganizationResponsibilityAssignmentStatus),
    typeCode: () => z.enum(OrganizationResponsibilityTypeCode),
  },
).omit({ createTime: true, updateTime: true });

export type OrganizationResponsibilityAssignment = z.infer<
  typeof selectOrganizationResponsibilityAssignmentSchema
>;
