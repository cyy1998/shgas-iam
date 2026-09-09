import { decodeCustomSsoLegacyGrant } from "./maintenance";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX, createRedisAuthorizationGrantRemovalStore } from "./redis-store";

/** Read-only observations and exact cleanup for grants issued by the production owner. */
export function createAuthorizationGrantRedisInspection(redis: {
  get: (key: string) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
}) {
  const removal = createRedisAuthorizationGrantRemovalStore({ redis });
  return {
    async inspect(grantId: string) {
      const raw = await redis.get(`${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`);
      if (raw === null)
        return null;
      const record = decodeCustomSsoLegacyGrant(`${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`, raw);
      if (record.grantId !== grantId)
        throw new Error("Authorization Grant inspection identity mismatch");
      return record.state === "redeeming"
        ? { state: record.state, expiresAt: record.expiresAt, attemptId: record.attemptId, leaseExpiresAt: record.leaseExpiresAt }
        : { state: record.state, expiresAt: record.expiresAt };
    },
    remove: removal.remove,
  };
}

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

/** Malformed old records for the stopped-writer migration's fail-closed contract. */
export function createLegacyGrantMaintenanceFixture(redis: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
}, trackKey: (key: string) => void) {
  return {
    async corrupt(grantId: string, problem: "json" | "version" | "identity" | "state") {
      const key = `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`;
      trackKey(key);
      const raw = problem === "json"
        ? "{broken"
        : JSON.stringify({
            version: problem === "version" ? 99 : 1,
            grantId: problem === "identity" ? "other-owner" : grantId,
            state: problem === "state" ? "unknown" : "issued",
            expiresAt: Date.now() + 60_000,
          });
      await redis.set(key, raw);
    },
    async observe(grantId: string) { return await redis.get(`${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`); },
  };
}
