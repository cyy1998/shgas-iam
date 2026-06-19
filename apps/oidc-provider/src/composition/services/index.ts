import type { OidcProviderEnv } from "../../env.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createGlobalSessionResolver } from "../../interaction/global-session.ts";
import { createIamInteractionPolicy } from "../../interaction/policy.ts";
import { createOidcClaimsService } from "../../provider/claims.ts";
import { createClientAuthRateLimiter } from "../../security/client-auth-rate-limit.ts";
import { createOidcClientSecretVerifier } from "../../security/client-secret-verifier.ts";

export interface CreateOidcProviderServicesDeps {
  env: OidcProviderEnv;
  repositories: Pick<OidcProviderRepositories, "account" | "authorization" | "client">;
  stores: Pick<OidcProviderStores, | "clientAuthFailures"
  | "clientRuntime"
  | "globalSessions"
  | "providerSessions"
  | "tokens">;
}

export function createOidcProviderServices(deps: CreateOidcProviderServicesDeps) {
  const globalSessionResolver = createGlobalSessionResolver({
    accounts: deps.repositories.account,
    sessions: deps.stores.globalSessions,
    cookieName: deps.env.OIDC_GLOBAL_SESSION_COOKIE,
  });
  const claims = createOidcClaimsService({
    accounts: deps.repositories.account,
    authorization: deps.repositories.authorization,
    clients: deps.stores.clientRuntime,
    globalSessions: globalSessionResolver,
    providerSessions: deps.stores.providerSessions,
    tokens: deps.stores.tokens,
  });
  const clientAuthRateLimiter = createClientAuthRateLimiter(
    deps.stores.clientAuthFailures,
    deps.env.OIDC_CLIENT_AUTH_FAILURE_LIMIT,
  );

  return {
    claims,
    clientAuthRateLimiter,
    clientSecretVerifier: createOidcClientSecretVerifier({ repository: deps.repositories.client }),
    globalSessionResolver,
    interactionPolicy: createIamInteractionPolicy(globalSessionResolver),
  };
}

export type OidcProviderServices = ReturnType<typeof createOidcProviderServices>;
