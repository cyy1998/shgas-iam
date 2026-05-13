import { RoleStatus } from "@iam/contracts";
import { boolean, index, integer, serial, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { timestampColumns } from "../_shard/base-columns";

export const roles = snakeCase.table("role", {
  id: serial().primaryKey(),
  roleCode: varchar({ length: 64 }).notNull().unique(),
  roleName: varchar({ length: 128 }).notNull(),
  clientId: integer().notNull(),
  status: integer().$type<RoleStatus>().notNull().default(RoleStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: boolean().notNull().default(false),
  ...timestampColumns(),
}, table => [
  index("idx_client_id").on(table.clientId),
]);

export const selectRoleSchema = createSelectSchema(roles);
