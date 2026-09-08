import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./grant/redis-store";

export function customSsoMaintenancePrefixes(): readonly string[] {
  return [AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX];
}
