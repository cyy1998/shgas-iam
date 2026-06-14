import {
  ClientManagementLevel,
  ClientStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const clientExtAttributesSchema = z.object({
  userExcluding: z.array(z.string()).default([]),
  requireOrcas: z.boolean().default(false),
  validRedirectUrls: z.array(
    z.string().describe("Redirect URL pattern, e.g. https://app.example.com, https://*.example.com, or https://app.example.com/path/*"),
  ).default([]).describe("Allowed redirect URL patterns for SSO authorize and callback validation"),
  managementLevel: z.enum(ClientManagementLevel).default(ClientManagementLevel.None),
  logoutEndpoint: z.url().default("http://localhost:8888"),
  callbackEndpoint: z.url().default("http://localhost:8888"),
});

export type ClientExtAttributes = z.infer<typeof clientExtAttributesSchema>;

export function isValidOidcRedirectUri(value: string) {
  if (value !== value.trim() || !/^https?:\/\//u.test(value) || /[*{}]/u.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hash === "";
  }
  catch {
    return false;
  }
}

export const oidcRedirectUriSchema = z.string().min(1).refine(isValidOidcRedirectUri, {
  message: "OIDC redirect URI 必须是无 fragment、通配符或模板变量的绝对 HTTP/HTTPS URI",
});

const oidcRedirectUriListSchema = z.array(oidcRedirectUriSchema).min(1).refine(
  values => new Set(values).size === values.length,
  { message: "OIDC redirect URI 不得重复" },
);

const oidcPostLogoutRedirectUriListSchema = z.array(oidcRedirectUriSchema).refine(
  values => new Set(values).size === values.length,
  { message: "OIDC post logout redirect URI 不得重复" },
);

const oidcAllowedScopesSchema = z.array(z.enum(OidcScope)).min(1).refine(
  values => values.includes(OidcScope.OpenId),
  { message: "OIDC allowedScopes 必须包含 openid" },
).refine(
  values => new Set(values).size === values.length,
  { message: "OIDC allowedScopes 不得重复" },
);

const oidcClientConfigFields = {
  redirectUris: oidcRedirectUriListSchema,
  postLogoutRedirectUris: oidcPostLogoutRedirectUriListSchema,
  allowedScopes: oidcAllowedScopesSchema,
};

export const oidcClientConfigSchema = z.discriminatedUnion("clientType", [
  z.object({
    clientType: z.literal(OidcClientType.Public),
    ...oidcClientConfigFields,
    tokenEndpointAuthMethod: z.literal(OidcTokenEndpointAuthMethod.None),
  }),
  z.object({
    clientType: z.literal(OidcClientType.Confidential),
    ...oidcClientConfigFields,
    tokenEndpointAuthMethod: z.literal(OidcTokenEndpointAuthMethod.ClientSecretBasic),
  }),
]);

export type OidcClientConfig = z.infer<typeof oidcClientConfigSchema>;

export const oidcClientSecretStateSchema = z.object({
  oidcConfig: oidcClientConfigSchema.nullable(),
  oidcSecretHash: z.string().min(1).nullable(),
}).superRefine((value, ctx) => {
  const requiresSecret = value.oidcConfig?.clientType === OidcClientType.Confidential;
  if (requiresSecret !== (value.oidcSecretHash !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["oidcSecretHash"],
      message: requiresSecret
        ? "confidential OIDC client 必须保存 secret hash"
        : "public 或未配置的 OIDC client 不得保存 secret hash",
    });
  }
});

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
  oidcEnabled: boolean().notNull().default(false),
  oidcConfig: jsonb().$type<OidcClientConfig>(),
  oidcSecretHash: varchar({ length: 255 }),
  oidcConfigVersion: integer().notNull().default(0),
}, table => [
  check("client_oidc_enabled_config_check", sql`NOT ${table.oidcEnabled} OR ${table.oidcConfig} IS NOT NULL`),
]);

export const selectClientSchema = createSelectSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
});
export const insertClientSchema = createInsertSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateClientSchema = createUpdateSchema(clients, {
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
