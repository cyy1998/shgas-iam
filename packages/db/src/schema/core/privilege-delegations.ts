import { PrivilegeDelegationStatus } from "@iam/contracts";
import { index, integer, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const privilegeDelegations = snakeCase.table("privilege_delegation", {
  id: baseColumns.id,
  delegatorUserId: integer().notNull(),
  delegateeUserId: integer().notNull(),
  organizationScopeId: integer().notNull(),
  startTime: timestamp().notNull(),
  endTime: timestamp().notNull(),
  status: integer().$type<PrivilegeDelegationStatus>().notNull().default(PrivilegeDelegationStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("idx_delegationTo").on(table.delegatorUserId, table.delegateeUserId),
  index("idx_delegationFrom").on(table.delegateeUserId, table.delegatorUserId),
  index("idx_organizationScopeId").on(table.organizationScopeId),
]);

export const selectPrivilegeDelegationSchema = createSelectSchema(privilegeDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
});
export const insertPrivilegeDelegationSchema = createInsertSchema(privilegeDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updatePrivilegeDelegationSchema = createUpdateSchema(privilegeDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
