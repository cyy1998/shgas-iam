import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
import { integer, jsonb, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const clientExtAttributesSchema = z.object({
  userExcluding: z.array(z.string()).default([]),
  requireOrcas: z.boolean().default(false),
  validRedirectUrls: z.array(z.string()).default([]),
  managementLevel: z.enum(ClientManagementLevel).default(ClientManagementLevel.None),
  logoutEndpoint: z.url().default("http://localhost:8888"),
  callbackEndpoint: z.url().default("http://localhost:8888"),
});

export type ClientExtAttributes = z.infer<typeof clientExtAttributesSchema>;

export const clients = snakeCase.table("client", {
  id: baseColumns.id,
  clientCode: varchar({ length: 64 }).notNull().unique(),
  clientName: varchar({ length: 128 }).notNull(),
  clientSecret: varchar({ length: 255 }).notNull(),
  url: varchar({ length: 128 }),
  status: integer().$type<ClientStatus>().notNull().default(ClientStatus.Enable),
  description: varchar({ length: 500 }),
  isDelete: baseColumns.isDelete,
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
  extAttributes: jsonb().$type<ClientExtAttributes>().notNull(),
});

export const selectClientSchema = createSelectSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
});
export const insertClientSchema = createInsertSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateClientSchema = createUpdateSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
