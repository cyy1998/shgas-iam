import type { OrganizationHandlers } from "./organization.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./organization.routes";

export function createOrganizationRoute(handlers: OrganizationHandlers) {
  return createRouter().basePath("/organizations").openapi(routes.organizationsSearch, handlers.organizationsSearch).openapi(routes.organizationGetByCode, handlers.organizationGetByCode).openapi(routes.organizationUpdate, handlers.organizationUpdate).openapi(routes.purveyorRegister, handlers.purveyorRegister);
}
