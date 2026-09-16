import type { OfflineClientSsoConfig } from "@iam/contracts/offline-client-sso";
import { ClientSsoProtocol } from "@iam/contracts";
import { OfflineClientSsoConfigSchema } from "@iam/contracts/offline-client-sso";
import { validateRedirectUrlPattern } from "@iam/domain/client/redirect-url-pattern";
import { ValidatedClientSsoConfigSchema } from "@iam/domain/client/sso-configuration";

export const ValidatedOfflineClientSsoConfigSchema = OfflineClientSsoConfigSchema.superRefine((config, ctx) => {
  if (config.protocol === ClientSsoProtocol.CustomSso) {
    config.validRedirectUrls.forEach((pattern, index) => {
      if (!validateRedirectUrlPattern(pattern).ok) {
        ctx.addIssue({ code: "custom", path: ["validRedirectUrls", index], message: "非法 redirect URL pattern" });
      }
    });
  }
});

export function normalizeOfflineClientSsoConfig(input: OfflineClientSsoConfig): OfflineClientSsoConfig {
  const config = ValidatedOfflineClientSsoConfigSchema.parse(input);
  if (config.protocol === ClientSsoProtocol.CustomSso && config.callbackType === "managed") {
    const { callbackEndpoint: _endpoint, ...target } = config;
    ValidatedClientSsoConfigSchema.parse(target);
  }
  else {
    ValidatedClientSsoConfigSchema.parse(config);
  }
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
    callbackEndpoint: config.callbackEndpoint,
    callbackType: config.callbackType,
    validRedirectUrls: [...config.validRedirectUrls].sort(),
    subjectClaims: [...config.subjectClaims].sort(),
    ...(config.orcas?.enabled ? { orcas: { enabled: true } } : {}),
  };
}
