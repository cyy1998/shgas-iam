import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import { createOidcProtocolObjectStore } from "../../storage/redis-adapter.ts";
import { createClientAuthFailureStore } from "../../stores/client-auth-failure.store.ts";
import { createOidcClientRuntimeCache, createOidcClientRuntimeStore } from "../../stores/client-runtime.store.ts";
import { createOidcTokenStore } from "../../stores/token.store.ts";

export interface CreateOidcProviderStoresDeps {
  env: OidcProviderEnv;
  redis: Redis;
  repositories: Pick<OidcProviderRepositories, "client">;
}

export function createOidcProviderStores(deps: CreateOidcProviderStoresDeps) {
  const clientRuntimeCache = createOidcClientRuntimeCache(deps.redis, deps.env.oidc.clientCacheTtlSeconds);
  const clientRuntime = createOidcClientRuntimeStore({
    repository: deps.repositories.client,
    cache: clientRuntimeCache,
  });
  const tokens = createOidcTokenStore(deps.redis);

  return {
    clientRuntimeCache,
    clientRuntime,
    clientAuthFailures: createClientAuthFailureStore(
      deps.redis,
      deps.env.oidc.clientAuthFailureWindowSeconds,
    ),
    protocolObjects: createOidcProtocolObjectStore(deps.redis, tokens),
    tokens,
  };
}

export type OidcProviderStores = ReturnType<typeof createOidcProviderStores>;
