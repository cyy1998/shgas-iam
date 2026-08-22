import {
  ClientCodeSchema,
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  SUBJECT_CLAIMS,
  SubjectClaim,
} from "@iam/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, snakeCase, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

const clientStorageExtAttributesSchema = z.record(z.string(), z.unknown());

const customSsoSubjectClaimsSchema = z.array(z.enum(SUBJECT_CLAIMS))
  .min(1)
  .superRefine((claims, ctx) => {
    if (!claims.includes(SubjectClaim.SubjectIdentifier)) {
      ctx.addIssue({
        code: "custom",
        message: "Custom SSO subjectClaims 必须包含 subjectIdentifier",
      });
    }
    if (new Set(claims).size !== claims.length) {
      ctx.addIssue({
        code: "custom",
        message: "Custom SSO subjectClaims 不得重复",
      });
    }
  });

const customSsoCommonConfigFields = {
  validRedirectUrls: z.array(z.string().min(1)).min(1),
  subjectClaimCatalogVersion: z.literal(2),
  subjectClaims: customSsoSubjectClaimsSchema,
};

export const customSsoClientConfigSchema = z.discriminatedUnion("mode", [
  z.object({
    ...customSsoCommonConfigFields,
    mode: z.literal(CustomSsoClientMode.Gateway),
    orcas: z.object({ enabled: z.boolean() }).strict(),
  }).strict(),
  z.object({
    ...customSsoCommonConfigFields,
    mode: z.literal(CustomSsoClientMode.Independent),
    callbackEndpoint: z.url(),
    logoutEndpoint: z.url(),
  }).strict(),
]);

export type CustomSsoClientConfig = z.infer<typeof customSsoClientConfigSchema>;

export const customSsoClientStorageStateSchema = z.object({
  customSsoEnabled: z.boolean(),
  customSsoConfig: customSsoClientConfigSchema.nullable(),
  customSsoSecretHash: z.string().min(1).nullable(),
}).superRefine((value, ctx) => {
  if (value.customSsoConfig === null) {
    if (value.customSsoEnabled || value.customSsoSecretHash !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["customSsoConfig"],
        message: "未配置的 Custom SSO 必须保持禁用且不保存 secret hash",
      });
    }
    return;
  }

  const requiresSecret = value.customSsoConfig.mode === CustomSsoClientMode.Independent;
  if (requiresSecret !== (value.customSsoSecretHash !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["customSsoSecretHash"],
      message: requiresSecret
        ? "Independent Custom SSO client 必须保存 secret hash"
        : "Gateway Custom SSO client 不得保存 secret hash",
    });
  }
});

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
  extAttributes: jsonb().$type<Record<string, unknown>>().notNull(),
  oidcEnabled: boolean().notNull().default(false),
  oidcConfig: jsonb().$type<OidcClientConfig>(),
  oidcSecretHash: varchar({ length: 255 }),
  oidcConfigVersion: integer().notNull().default(0),
  customSsoEnabled: boolean().notNull().default(false),
  customSsoConfig: jsonb().$type<CustomSsoClientConfig>(),
  customSsoSecretHash: varchar({ length: 255 }),
  customSsoConfigVersion: integer().notNull().default(0),
}, table => [
  check("client_oidc_enabled_config_check", sql`NOT ${table.oidcEnabled} OR ${table.oidcConfig} IS NOT NULL`),
  check(
    "client_custom_sso_state_check",
    sql`((
      (
        ${table.customSsoConfig} IS NULL
        AND NOT ${table.customSsoEnabled}
        AND ${table.customSsoSecretHash} IS NULL
      )
      OR
      (
        ${table.customSsoConfig} IS NOT NULL
        AND ${table.customSsoConfigVersion} > 0
        AND jsonb_typeof(${table.customSsoConfig}) = 'object'
        AND jsonb_typeof(${table.customSsoConfig}->'validRedirectUrls') = 'array'
        AND jsonb_array_length(${table.customSsoConfig}->'validRedirectUrls') > 0
        AND jsonb_typeof(${table.customSsoConfig}->'subjectClaims') = 'array'
        AND jsonb_array_length(${table.customSsoConfig}->'subjectClaims') > 0
        AND ${table.customSsoConfig}->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
        AND jsonb_typeof(${table.customSsoConfig}->'subjectClaimCatalogVersion') = 'number'
        AND ${table.customSsoConfig}->>'subjectClaimCatalogVersion' = '2'
        AND (
          (
            ${table.customSsoConfig}->>'mode' = 'gateway'
            AND ${table.customSsoSecretHash} IS NULL
            AND (${table.customSsoConfig} - ARRAY[
              'validRedirectUrls',
              'subjectClaimCatalogVersion',
              'subjectClaims',
              'mode',
              'orcas'
            ]::text[]) = '{}'::jsonb
            AND jsonb_typeof(${table.customSsoConfig}->'orcas') = 'object'
            AND ((${table.customSsoConfig}->'orcas') - 'enabled'::text) = '{}'::jsonb
            AND jsonb_typeof(${table.customSsoConfig}->'orcas'->'enabled') = 'boolean'
          )
          OR
          (
            ${table.customSsoConfig}->>'mode' = 'independent'
            AND ${table.customSsoSecretHash} IS NOT NULL
            AND (${table.customSsoConfig} - ARRAY[
              'validRedirectUrls',
              'subjectClaimCatalogVersion',
              'subjectClaims',
              'mode',
              'callbackEndpoint',
              'logoutEndpoint'
            ]::text[]) = '{}'::jsonb
            AND jsonb_typeof(${table.customSsoConfig}->'callbackEndpoint') = 'string'
            AND ${table.customSsoConfig}->>'callbackEndpoint' <> ''
            AND jsonb_typeof(${table.customSsoConfig}->'logoutEndpoint') = 'string'
            AND ${table.customSsoConfig}->>'logoutEndpoint' <> ''
          )
        )
      )
    ) IS TRUE)`,
  ),
  check("client_custom_sso_config_version_check", sql`${table.customSsoConfigVersion} >= 0`),
]);

export const selectClientSchema = createSelectSchema(clients, {
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
  customSsoConfig: () => customSsoClientConfigSchema.nullable(),
});
export const insertClientSchema = createInsertSchema(clients, {
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
  customSsoConfig: () => customSsoClientConfigSchema.nullable(),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
export const updateClientSchema = createUpdateSchema(clients, {
  clientCode: () => ClientCodeSchema,
  status: () => z.enum(ClientStatus),
  extAttributes: () => clientStorageExtAttributesSchema,
  oidcConfig: () => oidcClientConfigSchema.nullable(),
  customSsoConfig: () => customSsoClientConfigSchema.nullable(),
}).omit({ id: true, createTime: true, updateTime: true, isDelete: true });
