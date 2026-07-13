import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { SigningKey } from "../../security/signing-keys.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderSecurity } from "../security/index.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createOidcInteractionHandler } from "../../interaction/handler.ts";
import { createIamInteractionPolicy } from "../../interaction/policy.ts";
import { createOidcClaimsAdapter } from "../../provider/claims.ts";
import { createOidcProvider } from "../../provider/create-provider.ts";
import { createOidcAdapterFactory } from "../../storage/redis-adapter.ts";

export interface CreateOidcProviderRuntimeDeps {
  env: OidcProviderEnv;
  logger: OidcLogger;
  redis: Redis;
  signingKeys: {
    current: SigningKey;
    previous?: SigningKey;
  };
  repositories: Pick<OidcProviderRepositories, "account" | "authorization">;
  security: Pick<OidcProviderSecurity, "clientAuthRateLimiter" | "clientSecretVerifier">;
  session: Pick<OidcProviderSession, "oidcSession">;
  stores: Pick<OidcProviderStores, | "clientRuntime"
  | "tokens">;
}

export function createOidcProviderRuntime(deps: CreateOidcProviderRuntimeDeps) {
  const adapter = createOidcAdapterFactory(deps.redis, {
    clients: deps.stores.clientRuntime,
    clientVersions: deps.stores.clientRuntime,
    oidcSession: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    tokens: deps.stores.tokens,
  });
  const claims = createOidcClaimsAdapter({
    accounts: deps.repositories.account,
    authorization: deps.repositories.authorization,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    tokens: deps.session.oidcSession,
  });
  const provider = createOidcProvider({
    env: deps.env,
    logger: deps.logger,
    signingKeys: deps.signingKeys,
    adapter,
    claims,
    interactionPolicy: createIamInteractionPolicy(deps.session.oidcSession),
    clientAuthRateLimiter: deps.security.clientAuthRateLimiter,
    clientSecretVerifier: deps.security.clientSecretVerifier,
    oidcSession: deps.session.oidcSession,
  });
  const interactions = createOidcInteractionHandler({
    provider,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    returnHandles: deps.session.oidcSession,
    env: deps.env,
  });

  return {
    provider,
    interactions,
  };
}

export type OidcProviderRuntime = ReturnType<typeof createOidcProviderRuntime>;
