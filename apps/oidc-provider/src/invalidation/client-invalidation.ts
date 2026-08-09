import type { Redis } from "ioredis";
import type { OidcLogger } from "../lib/logger.ts";
import { SystemLogEvent } from "@iam/api-core/logger";
import { OIDC_CLIENT_INVALIDATION_CHANNEL } from "@iam/api-core/oidc";

export interface ClientInvalidationProtocolObjectStore {
  revokeClient: (clientId: string) => Promise<unknown>;
}

export interface ClientInvalidationOidcSessionAdapter {
  revokeClientProtocol: (clientId: string, reason: "client_config_changed") => Promise<unknown>;
}

export interface ClientInvalidationSubscriberDeps {
  protocolObjects: ClientInvalidationProtocolObjectStore;
  oidcSession: ClientInvalidationOidcSessionAdapter;
}

export function startClientInvalidationSubscriber(
  redis: Redis,
  logger: OidcLogger,
  deps: ClientInvalidationSubscriberDeps,
) {
  const subscriber = redis.duplicate();
  const logSubscriptionFailure = (error: unknown) => {
    logger.warn({
      event: SystemLogEvent.OidcClientInvalidationSubscriptionFailed,
      err: error,
    }, "OIDC client invalidation subscription failed");
  };
  let subscribing = false;
  const subscribe = async () => {
    if (subscribing || subscriber.status !== "ready")
      return;
    subscribing = true;
    try {
      await subscriber.subscribe(OIDC_CLIENT_INVALIDATION_CHANNEL);
    }
    catch (error) {
      logSubscriptionFailure(error);
    }
    finally {
      subscribing = false;
    }
  };
  subscriber.on("error", logSubscriptionFailure);
  subscriber.on("ready", () => void subscribe());
  subscriber.on("message", (_channel, message) => {
    void (async () => {
      try {
        const event = JSON.parse(message) as { clientCode?: string };
        if (!event.clientCode)
          return;
        await deps.oidcSession.revokeClientProtocol(event.clientCode, "client_config_changed");
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
  if (subscriber.status === "wait")
    void subscriber.connect().catch(() => undefined);
  else if (subscriber.status === "ready")
    void subscribe();
  return subscriber;
}
