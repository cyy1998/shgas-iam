import type { ClientSsoConfig } from "@iam/contracts";
import { ClientSsoCallbackType, ClientSsoConfigSchema, ClientSsoProtocol } from "@iam/contracts";
import { validateRedirectUrlPattern } from "./redirect-url-pattern";

export const ValidatedClientSsoConfigSchema = ClientSsoConfigSchema.superRefine((config, ctx) => {
  if (config.protocol === ClientSsoProtocol.CustomSso) {
    config.validRedirectUrls.forEach((pattern, index) => {
      if (!validateRedirectUrlPattern(pattern).ok) {
        ctx.addIssue({ code: "custom", path: ["validRedirectUrls", index], message: "非法 redirect URL pattern" });
      }
    });
  }
});

export function normalizeClientSsoConfig(input: ClientSsoConfig): ClientSsoConfig {
  const config = ValidatedClientSsoConfigSchema.parse(input);
  if (config.protocol === ClientSsoProtocol.Oidc) {
    return {
      protocol: config.protocol,
      clientType: config.clientType,
      redirectUris: [...config.redirectUris].sort(),
      postLogoutRedirectUris: [...config.postLogoutRedirectUris].sort(),
      allowedScopes: [...config.allowedScopes].sort(),
    };
  }
  return {
    protocol: config.protocol,
    ...(config.callbackType === ClientSsoCallbackType.Business
      ? { callbackType: config.callbackType, callbackEndpoint: config.callbackEndpoint }
      : { callbackType: config.callbackType }),
    validRedirectUrls: [...config.validRedirectUrls].sort(),
    subjectClaims: [...config.subjectClaims].sort(),
    ...(config.orcas?.enabled ? { orcas: { enabled: true } } : {}),
  };
}
