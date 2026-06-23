import type { OidcProviderEnv } from "../../env.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createIamInteractionPolicy } from "../../interaction/policy.ts";
import { createOidcClaimsService } from "../../provider/claims.ts";
import { createClientAuthRateLimiter } from "../../security/client-auth-rate-limit.ts";
import { createOidcClientSecretVerifier } from "../../security/client-secret-verifier.ts";

export interface CreateOidcProviderServicesDeps {
  env: OidcProviderEnv;
  repositories: Pick<OidcProviderRepositories, "account" | "authorization" | "client">;
  session: Pick<OidcProviderSession, "oidcSession">;
  stores: Pick<OidcProviderStores, | "clientAuthFailures"
  | "clientRuntime"
  | "tokens">;
}

export function createOidcProviderServices(deps: CreateOidcProviderServicesDeps) {
  const claims = createOidcClaimsService({
    accounts: deps.repositories.account,
    authorization: deps.repositories.authorization,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    tokens: deps.session.oidcSession,
  });
  const clientAuthRateLimiter = createClientAuthRateLimiter(
    deps.stores.clientAuthFailures,
    deps.env.OIDC_CLIENT_AUTH_FAILURE_LIMIT,
  );

  return {
    claims,
    clientAuthRateLimiter,
    clientSecretVerifier: createOidcClientSecretVerifier({ repository: deps.repositories.client }),
    globalSessionResolver: deps.session.oidcSession,
    interactionPolicy: createIamInteractionPolicy(deps.session.oidcSession),
  };
}

export type OidcProviderServices = ReturnType<typeof createOidcProviderServices>;
