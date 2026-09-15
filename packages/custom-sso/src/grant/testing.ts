import { decodeCustomSsoLegacyGrant } from "./maintenance";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./redis-store";

/** Explicit old inventory fixture only; never used by an online authorization writer. */
export function createLegacyAuthorizationGrantFixture(options: {
  redis: { set: (key: string, value: string, expiry: "PXAT", expiresAt: number) => Promise<unknown> };
  trackKey?: (key: string) => void;
}) {
  return {
    async initialize(record: ReturnType<typeof decodeCustomSsoLegacyGrant>) {
      const key = `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${record.grantId}`;
      options.trackKey?.(key);
      decodeCustomSsoLegacyGrant(key, JSON.stringify(record));
      await options.redis.set(key, JSON.stringify(record), "PXAT", record.expiresAt);
    },
  };
}
