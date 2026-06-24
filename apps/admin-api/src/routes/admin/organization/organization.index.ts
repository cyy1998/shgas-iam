import type { PublicBindings } from "@iam/api-core/types";
import type { OrganizationAdapter } from "./organization.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./organization.routes";

export function createOrganizationRoute(adapter: OrganizationAdapter) {
  return createRouter<PublicBindings>().basePath("/organizations").openapi(routes.organizationsSearch, adapter.organizationsSearch).openapi(routes.organizationsChildren, adapter.organizationsChildren).openapi(routes.organizationsSelector, adapter.organizationsSelector).openapi(routes.organizationDetail, adapter.organizationDetail).openapi(routes.organizationCreate, adapter.organizationCreate).openapi(routes.organizationUpdate, adapter.organizationUpdate).openapi(routes.organizationStatusUpdate, adapter.organizationStatusUpdate).openapi(routes.organizationDelete, adapter.organizationDelete);
}
