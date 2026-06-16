import type { Redis } from "ioredis";
import type { OidcLogger } from "../lib/logger.ts";
import { SystemLogEvent } from "@iam/api-core/logger";
import {
  OIDC_CLIENT_INVALIDATION_CHANNEL,
  revokeOidcAccessTokensForClient,
} from "@iam/api-core/oidc";
import { revokeClientProtocolObjects } from "../storage/redis-adapter.ts";

export function startClientInvalidationSubscriber(redis: Redis, logger: OidcLogger) {
  const subscriber = redis.duplicate();
  subscriber.on("message", (_channel, message) => {
    void (async () => {
      try {
        const event = JSON.parse(message) as { clientCode?: string };
        if (!event.clientCode)
          return;
        await revokeOidcAccessTokensForClient(redis, event.clientCode);
        await revokeClientProtocolObjects(redis, event.clientCode);
      }
      catch (error) {
        logger.warn({
          event: SystemLogEvent.OidcClientInvalidationCleanupFailed,
          err: error,
          sourceApp: "iam-oidc-provider",
        }, "OIDC client invalidation cleanup failed");
      }
    })();
  });
  void subscriber.subscribe(OIDC_CLIENT_INVALIDATION_CHANNEL);
  return subscriber;
}
