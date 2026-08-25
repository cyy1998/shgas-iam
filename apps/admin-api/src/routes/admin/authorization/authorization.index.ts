import type { AdminBindings } from "@admin-api/types/lib";
import type { AdminAuthorizationAdapter } from "./authorization.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./authorization.routes";

export function createAdminAuthorizationRoute(
  adapter: AdminAuthorizationAdapter,
) {
  return createRouter<AdminBindings>()
    .basePath("/authorization")
    .openapi(routes.capabilitySummary, adapter.capabilitySummary);
}
