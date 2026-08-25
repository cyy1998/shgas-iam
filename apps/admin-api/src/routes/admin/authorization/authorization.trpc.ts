import type { AdminAuthorizationAdapter } from "./authorization.adapter";

export function createAdminAuthorizationAdminRouter(
  adapter: AdminAuthorizationAdapter,
) {
  return adapter.authorizationAdminRouter;
}
