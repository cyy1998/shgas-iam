import {
  ClientCodeSchema,
  ClientSsoConfigSchema,
  ClientStatus,
} from "@iam/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, snakeCase, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

const clientStorageExtAttributesSchema = z.record(z.string(), z.unknown());

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
  extAttributes: jsonb().$type<Record<string, unknown>>().notNull(),
  ssoEnabled: boolean().notNull().default(false),
  ssoConfig: jsonb().$type<z.infer<typeof ClientSsoConfigSchema>>(),
  ssoSecret: varchar({ length: 255 }),
  ssoCredentialId: uuid(),
  ssoSecretUpdatedAt: timestamp({ withTimezone: true, mode: "string" }),
}, table => [
  check("client_sso_enabled_config_check", sql`NOT ${table.ssoEnabled} OR ${table.ssoConfig} IS NOT NULL`),
  check("client_sso_credential_check", sql`(
    (${table.ssoSecret} IS NULL AND ${table.ssoCredentialId} IS NULL AND ${table.ssoSecretUpdatedAt} IS NULL)
    OR (${table.ssoSecret} IS NOT NULL AND length(${table.ssoSecret}) > 0
      AND ${table.ssoCredentialId} IS NOT NULL AND ${table.ssoSecretUpdatedAt} IS NOT NULL)
  )`),
  check("client_sso_config_check", sql`(${table.ssoConfig} IS NULL OR (
    jsonb_typeof(${table.ssoConfig}) = 'object' AND (
      (${table.ssoConfig}->>'protocol' = 'oidc'
        AND (${table.ssoConfig} - ARRAY['protocol','clientType','redirectUris','postLogoutRedirectUris','allowedScopes']) = '{}'::jsonb
        AND ${table.ssoConfig}->>'clientType' IN ('public','confidential')
        AND jsonb_typeof(${table.ssoConfig}->'redirectUris') = 'array'
        AND jsonb_array_length(${table.ssoConfig}->'redirectUris') > 0
        AND jsonb_typeof(${table.ssoConfig}->'postLogoutRedirectUris') = 'array'
        AND jsonb_typeof(${table.ssoConfig}->'allowedScopes') = 'array'
        AND ${table.ssoConfig}->'allowedScopes' @> '["openid"]'::jsonb)
      OR (${table.ssoConfig}->>'protocol' = 'custom-sso'
        AND (${table.ssoConfig} - ARRAY['protocol','callbackEndpoint','validRedirectUrls','subjectClaims','orcas']) = '{}'::jsonb
        AND jsonb_typeof(${table.ssoConfig}->'callbackEndpoint') = 'string'
        AND ${table.ssoConfig}->>'callbackEndpoint' ~ '^https?://[^[:space:]]+$'
        AND jsonb_typeof(${table.ssoConfig}->'validRedirectUrls') = 'array'
        AND jsonb_array_length(${table.ssoConfig}->'validRedirectUrls') > 0
        AND jsonb_typeof(${table.ssoConfig}->'subjectClaims') = 'array'
        AND ${table.ssoConfig}->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
        AND (NOT (${table.ssoConfig} ? 'orcas') OR (
          jsonb_typeof(${table.ssoConfig}->'orcas') = 'object'
          AND ((${table.ssoConfig}->'orcas') - 'enabled') = '{}'::jsonb
          AND jsonb_typeof(${table.ssoConfig}->'orcas'->'enabled') = 'boolean')))
    )
  )) IS TRUE`),
]);

export const selectClientSchema = createSelectSchema(clients, {
  ssoConfig: () => ClientSsoConfigSchema.nullable(),
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
});
export const insertClientSchema = createInsertSchema(clients, {
  ssoConfig: () => ClientSsoConfigSchema.nullable(),
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateClientSchema = createUpdateSchema(clients, {
  ssoConfig: () => ClientSsoConfigSchema.nullable(),
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
