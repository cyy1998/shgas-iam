import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { boolean, index, integer, snakeCase, text } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const organizations = snakeCase.table("organization", {
  id: baseColumns.id,
  orgCode: text().notNull().unique(),
  orgName: text().notNull(),
  parentId: integer().notNull().default(-1),
  businessParentId: integer().notNull().default(-1),
  path: text().notNull(),
  level: integer().$type<OrganizationLevel>().notNull(),
  orgType: text().$type<OrganizationType>().notNull(),
  orderNum: integer().notNull().default(0),
  isVirtual: boolean().notNull().default(false),
  isEntity: boolean().notNull().default(false),
  status: integer().$type<OrganizationStatus>().notNull().default(OrganizationStatus.Enable),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("idx_parentId").on(table.parentId),
]);

export const selectOrganizationSchema = createSelectSchema(organizations, {
  level: () => z.enum(OrganizationLevel),
  orgType: () => z.enum(OrganizationType),
  status: () => z.enum(OrganizationStatus),
});
export const insertOrganizationSchema = createInsertSchema(organizations, {
  level: () => z.enum(OrganizationLevel),
  orgType: () => z.enum(OrganizationType),
  status: () => z.enum(OrganizationStatus),
});
export const updateOrganizationSchema = createUpdateSchema(organizations, {
  level: () => z.enum(OrganizationLevel),
  orgType: () => z.enum(OrganizationType),
  status: () => z.enum(OrganizationStatus),
});

export type Organization = z.infer<typeof selectOrganizationSchema>;
