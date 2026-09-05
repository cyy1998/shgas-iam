import type { PublicBindings } from "@iam/api-core/types";
import type { PublicHandlers } from "./public.handlers";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/transport/custom-sso-delivery.security";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./public.routes";

export function createPublicRoute(handlers: PublicHandlers) {
  const router = createRouter<PublicBindings>();
  router.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );

  return router
    .openapi(routes.userInfo, handlers.userInfo)
    .openapi(routes.orcasId, handlers.orcasId)
    .openapi(routes.passwordChange, handlers.passwordChange)
    .openapi(routes.mobileSet, handlers.mobileSet)
    .openapi(routes.organizationsSearch, handlers.organizationsSearch)
    .openapi(routes.usersSearch, handlers.usersSearch);
}
