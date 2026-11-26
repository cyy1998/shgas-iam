import { createRouter } from "@iam/api-core/core/create-router";
import type { DelegationHandlers } from "./delegation.handlers";
import * as routes from "./delegation.routes";

export function createDelegationRoute(handlers: DelegationHandlers) {
  return createRouter()
    .basePath("/delegations")
    .openapi(routes.clientDelegationsResolve, handlers.clientDelegationsResolve)
    .openapi(routes.clientDelegationsQuery, handlers.clientDelegationsQuery)
    .openapi(routes.clientDelegationUpdate, handlers.clientDelegationUpdate)
    .openapi(routes.clientDelegationSet, handlers.clientDelegationSet);
}
