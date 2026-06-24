import type { SsoHandlers } from "./sso.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./sso.routes";

export function createSsoRoute(handlers: SsoHandlers) {
  return createRouter()
    .openapi(routes.endpointsConfiguration, handlers.endpointsConfiguration)
    .openapi(routes.callback, handlers.callback)
    .openapi(routes.token, handlers.token)
    .openapi(routes.authorize, handlers.authorize)
    .openapi(routes.logout, handlers.logout)
    .openapi(routes.loginOA, handlers.loginOA)
    .openapi(routes.loginWX, handlers.loginWX);
}
