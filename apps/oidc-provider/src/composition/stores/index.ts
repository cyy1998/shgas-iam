import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import {
  createClientRuntimeSnapshotLoggerObservability,
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { createOidcProtocolObjectStore } from "../../storage/redis-adapter.ts";
import { createClientAuthFailureStore } from "../../stores/client-auth-failure.store.ts";
import {
  createOidcClientRuntimeSnapshotAdapter,
  createOidcClientRuntimeStore,
} from "../../stores/client-runtime.store.ts";
import { createOidcTokenStore } from "../../stores/token.store.ts";

export interface CreateOidcProviderStoresDeps {
  env: OidcProviderEnv;
  redis: Redis;
  repositories: Pick<OidcProviderRepositories, "client">;
  logger?: OidcLogger;
}

export function createOidcProviderStores(deps: CreateOidcProviderStoresDeps) {
  const clientRuntimeSnapshots = createClientRuntimeSnapshotModule({
    redis: deps.redis,
    adapters: [
      createOidcClientRuntimeSnapshotAdapter({
        repository: deps.repositories.client,
        cacheTtlSeconds: deps.env.oidc.clientCacheTtlSeconds,
      }),
      createClientTrafficGateSnapshotAdapter({
        source: deps.repositories.client,
      }),
    ],
    observability: deps.logger === undefined
      ? undefined
      : createClientRuntimeSnapshotLoggerObservability(deps.logger),
  });
  const clientRuntime = createOidcClientRuntimeStore(clientRuntimeSnapshots.reader("oidc"));
  const tokens = createOidcTokenStore(deps.redis);
  const clientTrafficGate = createClientTrafficGateReader(
    clientRuntimeSnapshots.reader("traffic-gate"),
  );

  return {
    clientRuntimeSnapshots,
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
