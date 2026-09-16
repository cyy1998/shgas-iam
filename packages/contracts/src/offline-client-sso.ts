import { z } from "zod";
import { ClientSsoCallbackType, ClientSsoProtocol } from "./client-sso";
import { OidcClientType, OidcScope } from "./oidc/client";

/** Offline intermediate configuration at 546fecb; not an online compatibility schema. */
export const OFFLINE_SUBJECT_CLAIMS = ["subjectIdentifier", "profile:username", "profile:name", "profile:phone", "profile:employments", "iam:authorization"] as const;

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

export const OfflineClientSsoOidcConfigSchema = z.object({
  protocol: z.literal(ClientSsoProtocol.Oidc),
  clientType: z.enum(OidcClientType),
  redirectUris: z.array(exactHttpUrl).min(1).refine(unique, "地址不得重复"),
  postLogoutRedirectUris: z.array(exactHttpUrl).refine(unique, "地址不得重复"),
  allowedScopes: z.array(z.enum(OidcScope)).min(1).refine(scopes => scopes.includes(OidcScope.OpenId), "必须包含 openid").refine(unique, "scope 不得重复"),
}).strict();

export const OfflineClientSsoCustomConfigSchema = z.object({
  protocol: z.literal(ClientSsoProtocol.CustomSso),
  callbackType: z.enum(ClientSsoCallbackType, { error: "请选择回调类型" }),
  callbackEndpoint: exactHttpUrl,
  validRedirectUrls: z.array(z.string().trim().min(1)).min(1).refine(unique, "地址不得重复"),
  subjectClaims: z.array(z.enum(OFFLINE_SUBJECT_CLAIMS)).min(1).refine(claims => claims.includes("subjectIdentifier"), "必须包含 subjectIdentifier").refine(unique, "claim 不得重复"),
  orcas: z.object({ enabled: z.boolean() }).strict().optional(),
}).strict().refine(config => config.callbackType === ClientSsoCallbackType.Managed || !config.orcas?.enabled, {
  path: ["orcas", "enabled"],
  message: "业务回调不能启用 ORCAS，请先关闭 ORCAS",
});

export const OfflineClientSsoConfigSchema = z.discriminatedUnion("protocol", [
  OfflineClientSsoOidcConfigSchema,
  OfflineClientSsoCustomConfigSchema,
]);
export type OfflineClientSsoConfig = z.infer<typeof OfflineClientSsoConfigSchema>;
