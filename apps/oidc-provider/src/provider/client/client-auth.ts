import type Provider from "oidc-provider";

export interface ProviderClientSecretVerifier {
  verify: (clientId: string, secret: string) => Promise<boolean>;
}

export function registerClientAuthentication(
  provider: Provider,
  clientSecrets: ProviderClientSecretVerifier,
) {
  provider.Client.prototype.compareClientSecret = async function compareClientSecret(actual: string) {
    return await clientSecrets.verify(this.clientId, actual);
  };
  provider.Client.prototype.redirectUriAllowed = function redirectUriAllowed(actual: string) {
    return this.redirectUris?.includes(actual) ?? false;
  };
  provider.Client.prototype.postLogoutRedirectUriAllowed = function postLogoutRedirectUriAllowed(actual: string) {
    return this.postLogoutRedirectUris?.includes(actual) ?? false;
  };
}
