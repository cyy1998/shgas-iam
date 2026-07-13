import type { OidcProviderEnv } from "../../env.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createClientAuthRateLimiter } from "../../security/client-auth-rate-limit.ts";
import { createOidcClientSecretVerifier } from "../../security/client-secret-verifier.ts";

export interface CreateOidcProviderSecurityDeps {
  env: OidcProviderEnv;
  repositories: Pick<OidcProviderRepositories, "client">;
  stores: Pick<OidcProviderStores, "clientAuthFailures">;
}

export function createOidcProviderSecurity(deps: CreateOidcProviderSecurityDeps) {
  return {
    clientAuthRateLimiter: createClientAuthRateLimiter(
      deps.stores.clientAuthFailures,
      deps.env.oidc.clientAuthFailureLimit,
    ),
    clientSecretVerifier: createOidcClientSecretVerifier({ repository: deps.repositories.client }),
  };
}

export type OidcProviderSecurity = ReturnType<typeof createOidcProviderSecurity>;
