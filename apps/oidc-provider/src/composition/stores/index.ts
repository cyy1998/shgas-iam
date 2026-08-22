import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import { createClientTrafficGateReader } from "@iam/api-core/client-traffic-gate";
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
  const clientTrafficGate = createClientTrafficGateReader({
    redis: deps.redis,
    source: deps.repositories.client,
  });

  return {
    clientRuntimeCache,
    clientRuntime,
    clientTrafficGate,
    clientAuthFailures: createClientAuthFailureStore(
      deps.redis,
      deps.env.oidc.clientAuthFailureWindowSeconds,
    ),
    protocolObjects: createOidcProtocolObjectStore(deps.redis),
    tokens,
  };
}

export type OidcProviderStores = ReturnType<typeof createOidcProviderStores>;
