import type { DelegationHandlers } from "./delegation.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./delegation.routes";

export function createDelegationRoute(handlers: DelegationHandlers) {
  return createRouter()
    .basePath("/delegations")
    .openapi(
      routes.privilegeDelegationsResolve,
      handlers.privilegeDelegationsResolve,
    )
    .openapi(
      routes.privilegeDelegationsQuery,
      handlers.privilegeDelegationsQuery,
    )
    .openapi(
      routes.privilegeDelegationUpdate,
      handlers.privilegeDelegationUpdate,
    )
    .openapi(
      routes.privilegeDelegationSet,
      handlers.privilegeDelegationSet,
    );
}
