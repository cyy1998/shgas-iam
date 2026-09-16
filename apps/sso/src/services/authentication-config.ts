import { isRootRelativeNavigation } from '@iam/contracts';
import { WELL_KNOWN_URL } from '@sso/constants/config';
import type { AuthConfig } from '@sso/types/api';

function navigationEndpoint(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') return null;
  if (isRootRelativeNavigation(value)) return value;
  const endpoint = new URL(value);
  if (endpoint.origin !== origin || endpoint.username || endpoint.password)
    return null;
  const path = `${endpoint.pathname}${endpoint.search}${endpoint.hash}`;
  return isRootRelativeNavigation(path) ? path : null;
}

export async function fetchAuthenticationConfig(
  origin = window.location.origin,
): Promise<AuthConfig | null> {
  try {
    const res = await fetch(WELL_KNOWN_URL, { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    const cfg = body?.data ?? body;
    const authorizationEndpoint = navigationEndpoint(
      cfg?.authorizationEndpoint,
      origin,
    );
    const logoutEndpoint = navigationEndpoint(cfg?.logoutEndpoint, origin);
    if (!authorizationEndpoint || !logoutEndpoint) return null;
    return {
      authorizationEndpoint,
      logoutEndpoint,
    };
  } catch {
    return null;
  }
}
