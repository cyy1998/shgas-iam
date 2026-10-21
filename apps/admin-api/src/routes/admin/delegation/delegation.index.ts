import type { AdminBindings } from "@admin-api/types/lib";
import { createRouter } from "@iam/api-core/core/create-router";
import type { DelegationAdapter } from "./delegation.adapter";
import * as routes from "./delegation.routes";

export function createDelegationRoute(adapter: DelegationAdapter) {
  return createRouter<AdminBindings>()
    .basePath("/delegations")
    .openapi(routes.delegationSearch, adapter.search)
    .openapi(routes.delegationCreate, adapter.create)
    .openapi(routes.delegationUpdate, adapter.update)
    .openapi(routes.delegationUsers, adapter.selectUsers)
    .openapi(routes.delegationClients, adapter.selectClients)
    .openapi(routes.delegationOrganizations, adapter.selectOrganizations);
}
