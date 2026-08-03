import type { OidcScope } from "@iam/contracts";
import { OIDC_SUPPORTED_SCOPES } from "@iam/contracts";

const SUPPORTED_SCOPES = new Set<unknown>(OIDC_SUPPORTED_SCOPES);

function isOidcScope(scope: unknown): scope is OidcScope {
  return SUPPORTED_SCOPES.has(scope);
}

export interface OidcProtocolScopeSource {
  scope?: unknown;
  scopes?: unknown;
}

export function normalizeOidcProtocolScopes(source: OidcProtocolScopeSource): OidcScope[] | null {
  let scopes: unknown[];
  if (typeof source.scope === "string")
    scopes = source.scope.split(" ").filter(Boolean);
  else if (source.scopes instanceof Set)
    scopes = [...source.scopes];
  else if (Array.isArray(source.scopes))
    scopes = source.scopes;
  else
    scopes = [];

  return scopes.every(isOidcScope) ? scopes : null;
}
