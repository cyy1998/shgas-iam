import type { AuthConfig } from '@sso/types/api';

export function buildAuthorizeUrl(
  cfg: AuthConfig,
  redirectUrl: string,
  client: string,
  state?: string,
): string {
  const r = encodeURIComponent(redirectUrl);
  const c = encodeURIComponent(client);
  const stateQuery =
    state === undefined ? '' : `&state=${encodeURIComponent(state)}`;
  return `${cfg.authorizationEndpoint}?redirectUrl=${r}&client=${c}${stateQuery}`;
}

export function buildLogoutUrl(
  cfg: AuthConfig,
  redirectUrl: string,
  client: string,
): string {
  const r = encodeURIComponent(redirectUrl);
  const c = encodeURIComponent(client);
  return `${cfg.logoutEndpoint}?redirectUrl=${r}&client=${c}`;
}
