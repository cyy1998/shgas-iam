import { PrivilegeDelegationStatus } from "@iam/contracts";
import { index, integer, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const clientDelegations = snakeCase.table(
  "client_delegation",
  {
    id: baseColumns.id,
    delegatorUserId: integer().notNull(),
    delegateeUserId: integer().notNull(),
    clientId: integer().notNull(),
    organizationScopeId: integer().notNull(),
    startTime: timestamp().notNull(),
    endTime: timestamp().notNull(),
    status: integer().$type<PrivilegeDelegationStatus>().notNull().default(PrivilegeDelegationStatus.Enable),
    description: varchar({ length: 500 }),
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    index("client_delegation_delegator_client_idx").on(table.delegatorUserId, table.clientId),
    index("client_delegation_delegatee_idx").on(table.delegateeUserId),
    index("client_delegation_client_idx").on(table.clientId),
    index("client_delegation_organization_idx").on(table.organizationScopeId),
  ],
);
export const selectClientDelegationSchema = createSelectSchema(clientDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
});
export const insertClientDelegationSchema = createInsertSchema(clientDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
}).omit({ id: true, createTime: true, updateTime: true });
export const updateClientDelegationSchema = createUpdateSchema(clientDelegations, {
  status: () => z.enum(PrivilegeDelegationStatus),
}).pick({ startTime: true, endTime: true, status: true, description: true });
