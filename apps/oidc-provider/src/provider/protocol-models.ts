import type Provider from "oidc-provider";

export function registerProtocolModelPayloadExtensions(provider: Provider) {
  const authorizationCodeModel = provider.AuthorizationCode as typeof provider.AuthorizationCode & {
    IN_PAYLOAD: string[];
  };
  const authorizationCodePayload = authorizationCodeModel.IN_PAYLOAD;
  Object.defineProperty(authorizationCodeModel, "IN_PAYLOAD", {
    configurable: true,
    get: () => [...authorizationCodePayload, "globalSessionExpiresAt"],
  });
}
