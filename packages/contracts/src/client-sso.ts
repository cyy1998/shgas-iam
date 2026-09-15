import { z } from "zod";
import { SUBJECT_CLAIMS, SubjectClaim } from "./custom-sso/client";
import { OidcClientType, OidcScope, OidcTokenEndpointAuthMethod } from "./oidc/client";

export enum ClientSsoProtocol {
  Oidc = "oidc",
  CustomSso = "custom-sso",
}

const exactHttpUrl = z.string().min(1).refine((value) => {
  if (value !== value.trim() || /[\s*{}]/u.test(value))
    return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && url.hash === "" && url.username === "" && url.password === "";
  }
  catch {
    return false;
  }
}, "必须是无 fragment、通配符或凭据的完整 HTTP/HTTPS 地址");

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export const ClientSsoOidcConfigSchema = z.object({
  protocol: z.literal(ClientSsoProtocol.Oidc),
  clientType: z.enum(OidcClientType),
  redirectUris: z.array(exactHttpUrl).min(1).refine(unique, "地址不得重复"),
  postLogoutRedirectUris: z.array(exactHttpUrl).refine(unique, "地址不得重复"),
  allowedScopes: z.array(z.enum(OidcScope)).min(1).refine(scopes => scopes.includes(OidcScope.OpenId), "必须包含 openid").refine(unique, "scope 不得重复"),
}).strict();

export const ClientSsoCustomConfigSchema = z.object({
  protocol: z.literal(ClientSsoProtocol.CustomSso),
  callbackEndpoint: exactHttpUrl,
  validRedirectUrls: z.array(z.string().trim().min(1)).min(1).refine(unique, "地址不得重复"),
  subjectClaims: z.array(z.enum(SUBJECT_CLAIMS)).min(1).refine(claims => claims.includes(SubjectClaim.SubjectIdentifier), "必须包含 subjectIdentifier").refine(unique, "claim 不得重复"),
  orcas: z.object({ enabled: z.boolean() }).strict().optional(),
}).strict();

export const ClientSsoConfigSchema = z.discriminatedUnion("protocol", [
  ClientSsoOidcConfigSchema,
  ClientSsoCustomConfigSchema,
]);
export type ClientSsoConfig = z.infer<typeof ClientSsoConfigSchema>;

export function getClientSsoTokenEndpointAuthMethod(config: z.infer<typeof ClientSsoOidcConfigSchema>) {
  return config.clientType === OidcClientType.Public
    ? OidcTokenEndpointAuthMethod.None
    : OidcTokenEndpointAuthMethod.ClientSecretBasic;
}
