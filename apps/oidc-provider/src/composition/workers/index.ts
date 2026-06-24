import type { Redis } from "ioredis";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { startClientInvalidationSubscriber } from "../../invalidation/client-invalidation.ts";

export interface CreateOidcProviderWorkersDeps {
  redis: Redis;
  logger: OidcLogger;
  session: Pick<OidcProviderSession, "oidcSession">;
  stores: Pick<OidcProviderStores, "protocolObjects" | "tokens">;
}

export function createOidcProviderWorkers(deps: CreateOidcProviderWorkersDeps) {
  return {
    clientInvalidationSubscriber: startClientInvalidationSubscriber(deps.redis, deps.logger, {
      oidcSession: deps.session.oidcSession,
      protocolObjects: deps.stores.protocolObjects,
      tokens: deps.stores.tokens,
    }),
  };
}

export type OidcProviderWorkers = ReturnType<typeof createOidcProviderWorkers>;
