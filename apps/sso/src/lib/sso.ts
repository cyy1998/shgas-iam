import { WELL_KNOWN_URL } from '@sso/constants/config';
import type { AuthConfig } from '@sso/types/api';

export async function fetchAuthenticationConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(WELL_KNOWN_URL, { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    const cfg = body?.data ?? body;
    if (!cfg?.authorizationEndpoint || !cfg?.logoutEndpoint) return null;
    return {
      authorizationEndpoint: cfg.authorizationEndpoint,
      logoutEndpoint: cfg.logoutEndpoint,
    };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(
  cfg: AuthConfig,
  redirectUrl: string,
  client: string,
): string {
  const r = encodeURIComponent(redirectUrl);
  const c = encodeURIComponent(client);
  return `${cfg.authorizationEndpoint}?redirectUrl=${r}&client=${c}`;
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
