import { PrivilegeDelegationStatus } from "@iam/contracts";
import { boolean, index, integer, serial, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { timestampColumns } from "../_shard/base-columns";

export const privilegeDelegations = snakeCase.table("privilege_delegation", {
  id: serial().primaryKey(),
  delegatorUserId: integer().notNull(),
  delegateeUserId: integer().notNull(),
  organizationScopeId: integer().notNull(),
  startTime: timestamp().notNull(),
  endTime: timestamp().notNull(),
  status: integer().$type<PrivilegeDelegationStatus>().notNull().default(PrivilegeDelegationStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
}, table => [
  index("idx_delegationTo").on(table.delegatorUserId, table.delegateeUserId),
  index("idx_delegationFrom").on(table.delegateeUserId, table.delegatorUserId),
  index("idx_organizationScopeId").on(table.organizationScopeId),
]);

export const selectPrivilegeDelegationSchema = createSelectSchema(privilegeDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
});
