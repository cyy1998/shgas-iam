import type { AuthorizationGrantRemovalStore } from "./store";

export const AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX = "authorization-grant:redemption:v1:";

export interface AuthorizationGrantRedemptionRedis {
  readonly del: (...keys: string[]) => Promise<number>;
}

export function createRedisAuthorizationGrantRemovalStore(options: {
  redis: Pick<AuthorizationGrantRedemptionRedis, "del">;
  keyPrefix?: string;
}): AuthorizationGrantRemovalStore {
  const keyPrefix = options.keyPrefix ?? AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX;
  return {
    async remove(grantId) {
      return await options.redis.del(`${keyPrefix}${grantId}`) > 0
        ? "removed"
        : "missing";
    },
  };
}
