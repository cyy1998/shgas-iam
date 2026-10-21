import { createRouter } from "@iam/api-core/core/create-router";
import type { PublicBindings } from "@iam/api-core/types";
import type { PublicDelegationHandlers } from "./delegation.handlers";
import * as routes from "./delegation.routes";

/** Mounted only beneath the authenticated public router. */
export function createPublicDelegationRoute(handlers: PublicDelegationHandlers) {
  return createRouter<PublicBindings>()
    .openapi(routes.create, handlers.create)
    .openapi(routes.search, handlers.search)
    .openapi(routes.update, handlers.update)
    .openapi(routes.userChoices, handlers.userChoices)
    .openapi(routes.clientChoices, handlers.clientChoices)
    .openapi(routes.organizationChoices, handlers.organizationChoices);
}
