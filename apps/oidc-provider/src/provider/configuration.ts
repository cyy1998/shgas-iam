import type { Configuration, interactionPolicy, KoaContextWithOIDC } from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { SigningKey } from "../security/signing-keys.ts";
import type { OidcClaimsService } from "./claims.ts";
import { OIDC_SUPPORTED_SCOPES } from "@iam/contracts";

export type ProviderConfigurationDependencies = {
  adapter: NonNullable<Configuration["adapter"]>;
  claims: OidcClaimsService;
  currentSigningKey: SigningKey;
  previousSigningKey?: SigningKey;
  interactionPolicy: interactionPolicy.Prompt[];
};

export function createProviderConfiguration(
  env: OidcProviderEnv,
  dependencies: ProviderConfigurationDependencies,
): Configuration {
  const signingKeys = [dependencies.currentSigningKey.jwk];
  if (dependencies.previousSigningKey)
    signingKeys.push(dependencies.previousSigningKey.jwk);

  const tokenTtl = (configuredTtl: number) => (ctx: KoaContextWithOIDC) => {
    const code = ctx.oidc.entities.AuthorizationCode as { globalSessionExpiresAt?: number } | undefined;
    if (!code?.globalSessionExpiresAt)
      return configuredTtl;
    return Math.max(1, Math.min(configuredTtl, code.globalSessionExpiresAt - Math.floor(Date.now() / 1000)));
  };

  return {
    adapter: dependencies.adapter,
    claims: {
      "openid": ["sub"],
      "profile": ["name", "preferred_username"],
      "phone": ["phone_number"],
      "iam:authorization": ["iam:authorization"],
      "auth_time": null,
    },
    clientBasedCORS: (ctx, origin, client) => {
      if (ctx.oidc.route === "token" && client.clientAuthMethod !== "none")
        return false;
      if (ctx.oidc.route !== "token" && ctx.oidc.route !== "userinfo")
        return false;
      return client.redirectUris?.some(uri => new URL(uri).origin === origin) ?? false;
    },
    clientAuthMethods: ["none", "client_secret_basic"],
    cookies: {
      keys: env.oidc.cookieKeys,
      long: {
        httpOnly: true,
        overwrite: true,
        sameSite: "lax",
        secure: env.nodeEnv === "production",
      },
      short: {
        httpOnly: true,
        overwrite: true,
        sameSite: "lax",
        secure: env.nodeEnv === "production",
      },
    },
    enabledJWA: {
      idTokenSigningAlgValues: ["RS256"],
    },
    features: {
      backchannelLogout: { enabled: false },
      ciba: { enabled: false, deliveryModes: ["poll"] },
      claimsParameter: { enabled: false },
      clientCredentials: { enabled: false },
      dPoP: { enabled: false },
      devInteractions: { enabled: false },
      deviceFlow: { enabled: false },
      encryption: { enabled: false },
      introspection: { enabled: false },
      jwtIntrospection: { enabled: false },
      jwtResponseModes: { enabled: false },
      jwtUserinfo: { enabled: false },
      mTLS: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      registration: { enabled: false },
      registrationManagement: { enabled: false },
      requestObjects: { enabled: false },
      resourceIndicators: { enabled: false },
      revocation: { enabled: false },
      rpInitiatedLogout: { enabled: true },
      userinfo: { enabled: true },
      webMessageResponseMode: { enabled: false },
    },
    extraTokenClaims: async (_ctx, token) => {
      if (token.kind !== "AccessToken")
        return undefined;
      const extra = await dependencies.claims.createAccessTokenExtra(token);
      if (!extra)
        throw new Error("OIDC global session is unavailable");
      return extra;
    },
    findAccount: async (_ctx, subject, token) => await dependencies.claims.findAccount(subject, token),
    interactions: {
      policy: dependencies.interactionPolicy,
      url: (_ctx, interaction) => `${env.oidc.issuer}/interaction/${interaction.uid}`,
    },
    loadExistingGrant: async (ctx) => {
      const accountId = ctx.oidc.account?.accountId;
      const clientId = ctx.oidc.client?.clientId;
      if (!accountId || !clientId)
        return undefined;
      const grantId = ctx.oidc.session?.grantIdFor(clientId);
      const grant = grantId
        ? await ctx.oidc.provider.Grant.find(grantId)
        : new ctx.oidc.provider.Grant({ accountId, clientId });
      if (!grant)
        return undefined;
      const scope = typeof ctx.oidc.params?.scope === "string" ? ctx.oidc.params.scope : "openid";
      grant.addOIDCScope(scope);
      await grant.save();
      return grant;
    },
    jwks: { keys: signingKeys },
    pkce: { required: () => true },
    responseTypes: ["code"],
    scopes: [...OIDC_SUPPORTED_SCOPES],
    subjectTypes: ["public"],
    ttl: {
      AccessToken: tokenTtl(env.oidc.accessTokenTtlSeconds),
      AuthorizationCode: env.oidc.authorizationCodeTtlSeconds,
      IdToken: tokenTtl(env.oidc.idTokenTtlSeconds),
      Interaction: env.oidc.interactionTtlSeconds,
      Grant: env.oidc.accessTokenTtlSeconds,
      Session: env.oidc.globalSessionTtlSeconds,
    },
    acceptQueryParamAccessTokens: false,
    allowOmittingSingleRegisteredRedirectUri: false,
    extraClientMetadata: {
      properties: ["iam_client_id", "oidc_config_version", "allowed_scopes"],
    },
  };
}
