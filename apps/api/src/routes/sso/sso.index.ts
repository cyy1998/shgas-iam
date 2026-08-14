import type { SsoHandlers } from "./sso.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./sso.routes";
import { CUSTOM_SSO_BASIC_SECURITY_SCHEME } from "./sso.security";

export function createSsoRoute(handlers: SsoHandlers) {
  const router = createRouter();
  router.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_BASIC_SECURITY_SCHEME,
    {
      type: "http",
      scheme: "basic",
      description:
        "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
    },
  );

  return router
    .openapi(routes.endpointsConfiguration, handlers.endpointsConfiguration)
    .openapi(routes.callback, handlers.callback)
    .openapi(routes.token, handlers.token)
    .openapi(routes.authorize, handlers.authorize)
    .openapi(routes.loginGuard, handlers.loginGuard)
    .openapi(routes.logout, handlers.logout)
    .openapi(routes.loginOA, handlers.loginOA)
    .openapi(routes.loginWX, handlers.loginWX);
}
