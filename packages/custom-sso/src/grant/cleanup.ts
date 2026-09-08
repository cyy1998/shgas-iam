import type { CleanupAdapter } from "@iam/session-kernel";
import type { AuthorizationGrantRedemptionStore } from "./store";

export const AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND
  = "authorization-grant-redemption";
export const CUSTOM_SSO_PROTOCOL = "custom-sso";

export function createAuthorizationGrantRedemptionCleanupAdapter(
  store: Pick<AuthorizationGrantRedemptionStore, "remove">,
): CleanupAdapter {
  return {
    protocol: CUSTOM_SSO_PROTOCOL,
    kind: AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
    async cleanup(refs) {
      await Promise.all(refs.map(async ref => await store.remove(ref.ref)));
    },
  };
}
