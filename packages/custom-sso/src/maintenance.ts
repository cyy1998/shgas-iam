import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./grant/redis-store";
import { createScanVerifier } from "./grant/scan-verifier";

export { createLegacyGrantMaintenance, createLegacyGrantVerifier } from "./grant/inventory-maintenance";
export { decodeCustomSsoLegacyGrant } from "./grant/maintenance";
export * from "./unified-maintenance";
export function createOfflineGrantVerifier(redis: Parameters<typeof createScanVerifier>[0]) {
  return createScanVerifier(redis, AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX);
}
