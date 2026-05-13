import type { z } from "zod";
import { OrganizationStatus } from "@iam/contracts";
import { boolean, index, integer, serial, snakeCase, text } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const organizations = snakeCase.table("organization", {
  id: serial().primaryKey(),
  orgCode: text().notNull().unique(),
  orgName: text().notNull(),
  parentId: integer().notNull().default(-1),
  businessParentId: integer().notNull().default(-1),
  path: text().notNull(),
  level: integer().notNull(),
  orgType: text().notNull(),
  orderNum: integer().notNull().default(0),
  isVirtual: boolean().notNull().default(false),
  isEntity: boolean().notNull().default(false),
  status: integer().$type<OrganizationStatus>().notNull().default(OrganizationStatus.Enable),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
}, table => [
  index("idx_parentId").on(table.parentId),
]);

export const selectOrganizationSchema = createSelectSchema(organizations);

export type Organization = z.infer<typeof selectOrganizationSchema>;
