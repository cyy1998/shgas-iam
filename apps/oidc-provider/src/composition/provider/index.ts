import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { SigningKey } from "../../security/signing-keys.ts";
import type { OidcProviderServices } from "../services/index.ts";
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
  services: Pick<OidcProviderServices, | "claims"
  | "clientAuthRateLimiter"
  | "clientSecretVerifier"
  | "globalSessionResolver"
  | "interactionPolicy">;
  stores: Pick<OidcProviderStores, | "clientRuntime"
  | "globalSessions"
  | "providerSessions"
  | "returnHandles"
  | "tokens">;
}

export function createOidcProviderRuntime(deps: CreateOidcProviderRuntimeDeps) {
  const adapter = createOidcAdapterFactory(deps.redis, {
    clients: deps.stores.clientRuntime,
    clientVersions: deps.stores.clientRuntime,
    providerSessions: deps.stores.providerSessions,
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
    globalSessions: deps.stores.globalSessions,
    tokens: deps.stores.tokens,
  });
  const interactions = createOidcInteractionHandler({
    provider,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.services.globalSessionResolver,
    providerSessions: deps.stores.providerSessions,
    returnHandles: deps.stores.returnHandles,
    env: deps.env,
  });

  return {
    provider,
    interactions,
  };
}

export type OidcProviderRuntime = ReturnType<typeof createOidcProviderRuntime>;
