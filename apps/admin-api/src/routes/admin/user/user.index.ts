import type { PublicBindings } from "@iam/api-core/types";
import type { UserAdapter } from "./user.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./user.routes";

export function createUserRoute(adapter: UserAdapter) {
  return createRouter<PublicBindings>().basePath("/users").openapi(routes.usersSearch, adapter.usersSearch).openapi(routes.usersDetail, adapter.usersDetail).openapi(routes.usersCreate, adapter.usersCreate).openapi(routes.usersUpdate, adapter.usersUpdate).openapi(routes.usersStatusUpdate, adapter.usersStatusUpdate).openapi(routes.usersDelete, adapter.usersDelete).openapi(routes.usersResetPassword, adapter.usersResetPassword).openapi(routes.usersGeneratePassword, adapter.usersGeneratePassword);
}
