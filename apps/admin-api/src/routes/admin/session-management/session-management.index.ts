import type { AdminBindings } from "@admin-api/types/lib";
import { createRouter } from "@iam/api-core/core/create-router";
import type { SessionManagementAdapter } from "./session-management.adapter";
import * as routes from "./session-management.routes";

export function createSessionManagementRoute(adapter: SessionManagementAdapter) {
  return createRouter<AdminBindings>()
    .basePath("/session-management")
    .openapi(routes.loginRestrictionsSearch, adapter.loginRestrictionsSearch)
    .openapi(routes.loginRestrictionRelease, adapter.loginRestrictionRelease)
    .openapi(routes.sessionsSearch, adapter.sessionsSearch)
    .openapi(routes.sessionsRevoke, adapter.sessionsRevoke);
}
