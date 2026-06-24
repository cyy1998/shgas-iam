import type { AuthHandlers } from "./auth.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./auth.routes";

export function createAuthRoute(handlers: AuthHandlers) {
  return createRouter()
    .openapi(routes.loginPassword, handlers.loginPassword)
    .openapi(routes.loginMobile, handlers.loginMobile)
    // .openapi(routes.loginWX, handlers.loginWX)
    .openapi(routes.authz, handlers.authz)
    .openapi(routes.internalAuthz, handlers.internalAuthz);
}
