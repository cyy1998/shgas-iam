import type { UserDetailDto } from "@api/services/user/user.type";
import type { PublicBindings } from "@iam/api-core/types";
import type { PublicHandlers } from "./public.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./public.routes";

export function createPublicRoute(handlers: PublicHandlers) {
  return createRouter<PublicBindings<UserDetailDto>>()
    .openapi(routes.userInfo, handlers.userInfo)
    .openapi(routes.passwordChange, handlers.passwordChange)
    .openapi(routes.mobileSet, handlers.mobileSet)
    .openapi(routes.organizationsSearch, handlers.organizationsSearch)
    .openapi(routes.usersSearch, handlers.usersSearch);
}
