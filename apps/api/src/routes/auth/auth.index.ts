import type { AuthHandlers } from "./auth.handlers";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/transport/custom-sso-delivery.security";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./auth.routes";

export function createAuthRoute(handlers: AuthHandlers) {
  const router = createRouter();
  router.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );

  return router
    .openapi(routes.loginPassword, handlers.loginPassword)
    .openapi(routes.loginMobile, handlers.loginMobile)
    // .openapi(routes.loginWX, handlers.loginWX)
    .openapi(routes.authz, handlers.authz)
    .openapi(routes.internalAuthz, handlers.internalAuthz);
}
