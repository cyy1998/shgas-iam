import type { Redis } from "ioredis";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { startClientInvalidationSubscriber } from "../../invalidation/client-invalidation.ts";

export interface CreateOidcProviderWorkersDeps {
  redis: Redis;
  logger: OidcLogger;
  stores: Pick<OidcProviderStores, "protocolObjects" | "tokens">;
}

export function createOidcProviderWorkers(deps: CreateOidcProviderWorkersDeps) {
  return {
    clientInvalidationSubscriber: startClientInvalidationSubscriber(deps.redis, deps.logger, {
      protocolObjects: deps.stores.protocolObjects,
      tokens: deps.stores.tokens,
    }),
  };
}

export type OidcProviderWorkers = ReturnType<typeof createOidcProviderWorkers>;
