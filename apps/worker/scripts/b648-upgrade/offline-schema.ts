import { OidcClientType, OidcScope, OidcTokenEndpointAuthMethod } from "@iam/contracts";
import { OFFLINE_SUBJECT_CLAIMS } from "@iam/contracts/offline-client-sso";
import { z } from "zod";
/** Frozen source b6481f2de5c2930fc381d99e70520e0783091e9d configuration vocabulary; never exported by the online contracts. */
export enum CustomSsoClientMode {
  Gateway = "gateway",
  Independent = "independent",
}
const customSsoSubjectClaimsSchema = z.array(z.enum(OFFLINE_SUBJECT_CLAIMS))
  .min(1)
  .superRefine((claims, ctx) => {
    if (!claims.includes("subjectIdentifier")) {
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
