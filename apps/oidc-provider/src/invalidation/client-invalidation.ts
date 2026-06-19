import type { Redis } from "ioredis";
import type { OidcLogger } from "../lib/logger.ts";
import { SystemLogEvent } from "@iam/api-core/logger";
import { OIDC_CLIENT_INVALIDATION_CHANNEL } from "@iam/api-core/oidc";

export interface ClientInvalidationTokenStore {
  revokeClientAccessTokens: (clientId: string) => Promise<unknown>;
}

export interface ClientInvalidationProtocolObjectStore {
  revokeClient: (clientId: string) => Promise<unknown>;
}

export interface ClientInvalidationSubscriberDeps {
  tokens: ClientInvalidationTokenStore;
  protocolObjects: ClientInvalidationProtocolObjectStore;
}

export function startClientInvalidationSubscriber(
  redis: Redis,
  logger: OidcLogger,
  deps: ClientInvalidationSubscriberDeps,
) {
  const subscriber = redis.duplicate();
  subscriber.on("message", (_channel, message) => {
    void (async () => {
      try {
        const event = JSON.parse(message) as { clientCode?: string };
        if (!event.clientCode)
          return;
        await deps.tokens.revokeClientAccessTokens(event.clientCode);
        await deps.protocolObjects.revokeClient(event.clientCode);
      }
      catch (error) {
        logger.warn({
          event: SystemLogEvent.OidcClientInvalidationCleanupFailed,
          err: error,
        }, "OIDC client invalidation cleanup failed");
      }
    })();
  });
  void subscriber.subscribe(OIDC_CLIENT_INVALIDATION_CHANNEL);
  return subscriber;
}
