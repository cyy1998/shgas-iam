import type { UserHandlers } from "./user.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./user.routes";

export function createUserRoute(handlers: UserHandlers, options: { dslMaxLimit: number }) {
  return createRouter()
    .basePath("/users")
    .openapi(routes.userInfo, handlers.userInfo)
    .openapi(routes.usersSearch, handlers.usersSearch)
    .openapi(routes.createUsersSearchDslRoute(options.dslMaxLimit), handlers.usersSearchDsl)
    .openapi(routes.usersSearchWithPrivilegeDelegation, handlers.usersSearchWithPrivilegeDelegation)
    .openapi(routes.contactRegister, handlers.contactRegister);
}
