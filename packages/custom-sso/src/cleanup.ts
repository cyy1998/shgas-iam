import type { AuthorizationGrantRedemptionRedis } from "./grant/redis-store";
import { createAuthorizationGrantRedemptionCleanupAdapter } from "./grant/cleanup";
import { createRedisAuthorizationGrantRemovalStore } from "./grant/redis-store";

export function createCustomSsoCleanup(options: { redis: Pick<AuthorizationGrantRedemptionRedis, "del"> }) {
  return createAuthorizationGrantRedemptionCleanupAdapter(createRedisAuthorizationGrantRemovalStore(options));
}
