import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { SigningKey } from "../../security/signing-keys.ts";
import type { OidcProviderServices } from "../services/index.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createOidcInteractionHandler } from "../../interaction/handler.ts";
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
  session: Pick<OidcProviderSession, "oidcSession">;
  services: Pick<OidcProviderServices, | "claims"
  | "clientAuthRateLimiter"
  | "clientSecretVerifier"
  | "globalSessionResolver"
  | "interactionPolicy">;
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
  const provider = createOidcProvider({
    env: deps.env,
    logger: deps.logger,
    signingKeys: deps.signingKeys,
    adapter,
    claims: deps.services.claims,
    interactionPolicy: deps.services.interactionPolicy,
    clientAuthRateLimiter: deps.services.clientAuthRateLimiter,
    clientSecretVerifier: deps.services.clientSecretVerifier,
    oidcSession: deps.session.oidcSession,
  });
  const interactions = createOidcInteractionHandler({
    provider,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.services.globalSessionResolver,
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
