import type { PublicBindings } from "@iam/api-core/types";
import type { RoleAdapter } from "./role.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./role.routes";

export function createRoleRoute(adapter: RoleAdapter) {
  return createRouter<PublicBindings>()
    .basePath("/roles")
    .openapi(routes.rolesSearch, adapter.rolesSearch)
    .openapi(routes.roleDetail, adapter.roleDetail)
    .openapi(routes.roleCreate, adapter.roleCreate)
    .openapi(routes.roleUpdate, adapter.roleUpdate)
    .openapi(routes.roleStatusUpdate, adapter.roleStatusUpdate)
    .openapi(routes.roleDelete, adapter.roleDelete)
    .openapi(routes.roleAssignmentsSearch, adapter.roleAssignmentsSearch)
    .openapi(routes.roleAssignmentCreate, adapter.roleAssignmentCreate)
    .openapi(routes.roleAssignmentScopeUpdate, adapter.roleAssignmentScopeUpdate)
    .openapi(routes.roleAssignmentDelete, adapter.roleAssignmentDelete);
}
